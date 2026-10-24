#include <cstdint>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <nlohmann/json.hpp>

#include "protocol.hpp"
#include "vector_engine/engine.hpp"

namespace {

using namespace vector_engine;
using namespace vector_engine::bindings;

class WasmEngine {
public:
    [[nodiscard]] auto validate_json(const std::string& source) const -> std::string {
        const auto validation = engine_.validate(source);
        auto output = Json{{"valid", validation.valid()}, {"issues", Json::array()}};
        for (const auto& issue : validation.issues) {
            output["issues"].push_back(issue_to_json(issue));
        }
        if (validation.valid()) {
            output["scene"] = Json::parse(source);
        }
        return output.dump();
    }

    [[nodiscard]] auto render_svg(
        const std::string& source,
        std::uint32_t width,
        std::uint32_t height,
        const std::string& background
    ) const -> std::string {
        RenderOptions options;
        options.width = width;
        options.height = height;
        if (!apply_background_token(background, options.use_document_background, options.background)) {
            throw std::runtime_error{"Invalid background color"};
        }
        const auto result = engine_.render_svg(source, options);
        if (!result.ok()) {
            throw std::runtime_error{first_error_message(result.issues, "SVG rendering failed")};
        }
        return result.value;
    }

    [[nodiscard]] auto export_binary(
        const std::string& source,
        const std::string& format,
        std::uint32_t width,
        std::uint32_t height,
        int quality,
        const std::string& background
    ) const -> emscripten::val {
        const auto parsed_format = format_from_string(format);
        if (!parsed_format) {
            throw std::runtime_error{"Unsupported export format"};
        }
        ExportOptions options;
        options.format = *parsed_format;
        options.width = width;
        options.height = height;
        options.quality = quality;
        if (!apply_background_token(background, options.use_document_background, options.background)) {
            throw std::runtime_error{"Invalid background color"};
        }
        const auto result = engine_.export_image(source, options);
        if (!result.ok()) {
            throw std::runtime_error{first_error_message(result.issues, "Image export failed")};
        }
        auto array = emscripten::val::global("Uint8Array").new_(result.data.size());
        array.call<void>("set", emscripten::val{emscripten::typed_memory_view(result.data.size(), result.data.data())});
        return array;
    }

    [[nodiscard]] auto render_scoped_svg(const std::string& source, const std::string& options_json) -> std::string {
        const auto parsed_opts = Json::parse(options_json, nullptr, false, false);
        if (parsed_opts.is_discarded()) {
            return Json{{"ok", false}, {"issues", Json::array({issue_to_json({"options.json", "Invalid options JSON", "/options", Severity::error})})}}.dump();
        }
        RenderOptions options;
        bool bg_ok = true;
        populate_common_options(parsed_opts, options, bg_ok);
        if (!bg_ok) {
            return Json{{"ok", false}, {"issues", Json::array({issue_to_json({"output.background", "Invalid background color", "/output/background", Severity::error})})}}.dump();
        }
        const auto result = engine_.render_svg(source, options);
        Json issues = Json::array();
        for (const auto& issue : result.issues) {
            issues.push_back(issue_to_json(issue));
        }
        return Json{
            {"ok", result.ok()},
            {"svg", result.value},
            {"width", result.width},
            {"height", result.height},
            {"hasAlpha", result.has_alpha},
            {"bounds", bounds_to_json(result.source_bounds)},
            {"issues", std::move(issues)}
        }.dump();
    }

    [[nodiscard]] auto export_scoped_meta(const std::string& source, const std::string& options_json) -> std::string {
        last_bytes_.clear();
        const auto parsed_opts = Json::parse(options_json, nullptr, false, false);
        if (parsed_opts.is_discarded()) {
            return Json{{"ok", false}, {"issues", Json::array({issue_to_json({"options.json", "Invalid options JSON", "/options", Severity::error})})}}.dump();
        }
        const auto fmt_str = parsed_opts.value("format", std::string{"png"});
        const auto parsed_format = format_from_string(fmt_str);
        if (!parsed_format) {
            return Json{{"ok", false}, {"issues", Json::array({issue_to_json({"output.format", "Unsupported export format", "/output/format", Severity::error})})}}.dump();
        }
        RenderOptions common;
        bool bg_ok = true;
        populate_common_options(parsed_opts, common, bg_ok);
        if (!bg_ok) {
            return Json{{"ok", false}, {"issues", Json::array({issue_to_json({"output.background", "Invalid background color", "/output/background", Severity::error})})}}.dump();
        }
        ExportOptions options;
        options.format = *parsed_format;
        options.width = common.width;
        options.height = common.height;
        options.use_document_background = common.use_document_background;
        options.background = common.background;
        options.target = std::move(common.target);
        options.scale = common.scale;
        options.include_hidden = common.include_hidden;
        options.trim_to_bounds = common.trim_to_bounds;
        options.margin = common.margin;
        options.clip_to_bounds = common.clip_to_bounds;
        options.fit_mode = common.fit_mode;
        options.minify_svg = common.minify_svg;
        if (const auto q_it = parsed_opts.find("quality"); q_it != parsed_opts.end() && q_it->is_number_integer()) {
            options.quality = q_it->get<int>();
            options.quality_explicit = true;
        }
        if (parsed_opts.contains("minifySvg")) {
            options.minify_explicit = true;
        }
        if (parsed_opts.value("bmpBitDepth", 24) == 32) {
            options.bmp_variant = BmpVariant::rgba32;
        }
        if (const auto mem_it = parsed_opts.find("maxMemoryBytes"); mem_it != parsed_opts.end() && mem_it->is_number()) {
            const auto bytes = mem_it->get<double>();
            if (bytes > 0.0) {
                options.max_memory_bytes = static_cast<std::uint64_t>(bytes);
            }
        }
        auto result = engine_.export_image(source, options);
        Json issues = Json::array();
        for (const auto& issue : result.issues) {
            issues.push_back(issue_to_json(issue));
        }
        const auto ok = result.ok();
        if (ok) {
            last_bytes_ = std::move(result.data);
        }
        return Json{
            {"ok", ok},
            {"sizeBytes", last_bytes_.size()},
            {"width", result.width},
            {"height", result.height},
            {"hasAlpha", result.has_alpha},
            {"bounds", bounds_to_json(result.source_bounds)},
            {"issues", std::move(issues)}
        }.dump();
    }

    [[nodiscard]] auto take_last_bytes() -> emscripten::val {
        auto array = emscripten::val::global("Uint8Array").new_(last_bytes_.size());
        if (!last_bytes_.empty()) {
            array.call<void>("set", emscripten::val{emscripten::typed_memory_view(last_bytes_.size(), last_bytes_.data())});
        }
        last_bytes_.clear();
        return array;
    }

    [[nodiscard]] auto measure_bounds_json(const std::string& source, const std::string& options_json) const -> std::string {
        const auto parsed_opts = Json::parse(options_json, nullptr, false, false);
        ExportTarget target;
        bool include_hidden = false;
        if (parsed_opts.is_object()) {
            if (const auto t_it = parsed_opts.find("target"); t_it != parsed_opts.end()) {
                target = parse_target_json(*t_it);
            }
            include_hidden = parsed_opts.value("includeHidden", false);
        }
        const auto [bounds, issues] = engine_.measure_bounds(source, target, include_hidden);
        Json out_issues = Json::array();
        for (const auto& issue : issues) {
            out_issues.push_back(issue_to_json(issue));
        }
        return Json{
            {"hasBounds", bounds.has_value()},
            {"bounds", bounds ? bounds_to_json(*bounds) : Json(nullptr)},
            {"issues", std::move(out_issues)}
        }.dump();
    }

private:
    Engine engine_;
    std::vector<std::uint8_t> last_bytes_;
};

}

EMSCRIPTEN_BINDINGS(vector_engine_module) {
    emscripten::class_<WasmEngine>("Engine")
        .constructor<>()
        .function("validateJson", &WasmEngine::validate_json)
        .function("renderSvg", &WasmEngine::render_svg)
        .function("exportBinary", &WasmEngine::export_binary)
        .function("renderScopedSvg", &WasmEngine::render_scoped_svg)
        .function("exportScopedMeta", &WasmEngine::export_scoped_meta)
        .function("takeLastBytes", &WasmEngine::take_last_bytes)
        .function("measureBounds", &WasmEngine::measure_bounds_json);
}
