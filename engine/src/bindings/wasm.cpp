#include <cstdint>
#include <stdexcept>
#include <string>
#include <string_view>

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <nlohmann/json.hpp>

#include "vector_engine/engine.hpp"
#include "vector_engine/parser.hpp"

namespace {

using Json = nlohmann::json;

[[nodiscard]] auto issue_json(const vector_engine::Issue& issue) -> Json {
    return {
        {"code", issue.code},
        {"message", issue.message},
        {"path", issue.path},
        {"severity", issue.severity == vector_engine::Severity::error ? "error" : "warning"}
    };
}

[[nodiscard]] auto first_error(const std::vector<vector_engine::Issue>& issues, std::string_view fallback) -> std::string {
    for (const auto& issue : issues) {
        if (issue.severity == vector_engine::Severity::error) {
            return issue.message;
        }
    }
    return std::string{fallback};
}

void apply_background(std::string_view background, bool& use_document, std::optional<vector_engine::Color>& color) {
    if (background == "__DOCUMENT__") {
        use_document = true;
        color = std::nullopt;
        return;
    }
    use_document = false;
    if (background == "__TRANSPARENT__") {
        color = std::nullopt;
        return;
    }
    color = vector_engine::parse_color(background);
    if (!color) {
        throw std::runtime_error{"Invalid background color"};
    }
}

class WasmEngine {
public:
    [[nodiscard]] auto validate_json(const std::string& source) const -> std::string {
        const auto validation = engine_.validate(source);
        auto output = Json{{"valid", validation.valid()}, {"issues", Json::array()}};
        for (const auto& issue : validation.issues) {
            output["issues"].push_back(issue_json(issue));
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
        vector_engine::RenderOptions options;
        options.width = width;
        options.height = height;
        apply_background(background, options.use_document_background, options.background);
        const auto result = engine_.render_svg(source, options);
        if (!result.ok()) {
            throw std::runtime_error{first_error(result.issues, "SVG rendering failed")};
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
        const auto parsed_format = vector_engine::format_from_string(format);
        if (!parsed_format) {
            throw std::runtime_error{"Unsupported export format"};
        }
        vector_engine::ExportOptions options;
        options.format = *parsed_format;
        options.width = width;
        options.height = height;
        options.quality = quality;
        apply_background(background, options.use_document_background, options.background);
        const auto result = engine_.export_image(source, options);
        if (!result.ok()) {
            throw std::runtime_error{first_error(result.issues, "Image export failed")};
        }
        auto array = emscripten::val::global("Uint8Array").new_(result.data.size());
        array.call<void>("set", emscripten::val{emscripten::typed_memory_view(result.data.size(), result.data.data())});
        return array;
    }

private:
    vector_engine::Engine engine_;
};

}

EMSCRIPTEN_BINDINGS(vector_engine_module) {
    emscripten::class_<WasmEngine>("Engine")
        .constructor<>()
        .function("validateJson", &WasmEngine::validate_json)
        .function("renderSvg", &WasmEngine::render_svg)
        .function("exportBinary", &WasmEngine::export_binary);
}
