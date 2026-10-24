#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <string_view>
#include <vector>

#include "protocol.hpp"
#include "vector_engine/engine.hpp"

namespace {

using namespace vector_engine;
using namespace vector_engine::bindings;

Engine global_engine;
std::string global_text_output;
std::vector<std::uint8_t> global_binary_output;

void set_text_output(std::string value) {
    global_text_output = std::move(value);
}

}

extern "C" {

__attribute__((export_name("ve_alloc")))
std::uint8_t* ve_alloc(std::uint32_t size) {
    return static_cast<std::uint8_t*>(std::malloc(size == 0U ? 1U : size));
}

__attribute__((export_name("ve_free")))
void ve_free(void* pointer) {
    std::free(pointer);
}

__attribute__((export_name("ve_text_ptr")))
const char* ve_text_ptr() {
    return global_text_output.data();
}

__attribute__((export_name("ve_text_len")))
std::uint32_t ve_text_len() {
    return static_cast<std::uint32_t>(global_text_output.size());
}

__attribute__((export_name("ve_binary_ptr")))
const std::uint8_t* ve_binary_ptr() {
    return global_binary_output.data();
}

__attribute__((export_name("ve_binary_len")))
std::uint32_t ve_binary_len() {
    return static_cast<std::uint32_t>(global_binary_output.size());
}

__attribute__((export_name("ve_clear_buffers")))
void ve_clear_buffers() {
    global_text_output.clear();
    global_binary_output.clear();
}

__attribute__((export_name("ve_validate")))
std::uint32_t ve_validate(const char* src_ptr, std::uint32_t src_len) {
    const std::string_view source{src_ptr, src_len};
    const auto validation = global_engine.validate(source);
    auto output = Json{{"valid", validation.valid()}, {"issues", Json::array()}};
    for (const auto& issue : validation.issues) {
        output["issues"].push_back(issue_to_json(issue));
    }
    if (validation.valid()) {
        output["scene"] = Json::parse(source.begin(), source.end(), nullptr, false, false);
    }
    set_text_output(output.dump());
    return static_cast<std::uint32_t>(global_text_output.size());
}

__attribute__((export_name("ve_render_scoped")))
std::uint32_t ve_render_scoped(
    const char* src_ptr,
    std::uint32_t src_len,
    const char* opt_ptr,
    std::uint32_t opt_len
) {
    const std::string_view source{src_ptr, src_len};
    const std::string_view opt_view{opt_ptr, opt_len};
    const auto parsed_opts = Json::parse(opt_view.begin(), opt_view.end(), nullptr, false, false);
    if (parsed_opts.is_discarded()) {
        set_text_output(Json{{"ok", false}, {"issues", Json::array({issue_to_json({"options.json", "Invalid options JSON", "/options", Severity::error})})}}.dump());
        return static_cast<std::uint32_t>(global_text_output.size());
    }
    RenderOptions options;
    bool bg_ok = true;
    populate_common_options(parsed_opts, options, bg_ok);
    if (!bg_ok) {
        set_text_output(Json{{"ok", false}, {"issues", Json::array({issue_to_json({"output.background", "Invalid background color", "/output/background", Severity::error})})}}.dump());
        return static_cast<std::uint32_t>(global_text_output.size());
    }
    const auto result = global_engine.render_svg(source, options);
    Json issues = Json::array();
    for (const auto& issue : result.issues) {
        issues.push_back(issue_to_json(issue));
    }
    set_text_output(Json{
        {"ok", result.ok()},
        {"svg", result.value},
        {"width", result.width},
        {"height", result.height},
        {"hasAlpha", result.has_alpha},
        {"bounds", bounds_to_json(result.source_bounds)},
        {"issues", std::move(issues)}
    }.dump());
    return static_cast<std::uint32_t>(global_text_output.size());
}

__attribute__((export_name("ve_export_scoped")))
std::uint32_t ve_export_scoped(
    const char* src_ptr,
    std::uint32_t src_len,
    const char* opt_ptr,
    std::uint32_t opt_len
) {
    global_binary_output.clear();
    const std::string_view source{src_ptr, src_len};
    const std::string_view opt_view{opt_ptr, opt_len};
    const auto parsed_opts = Json::parse(opt_view.begin(), opt_view.end(), nullptr, false, false);
    if (parsed_opts.is_discarded()) {
        set_text_output(Json{{"ok", false}, {"issues", Json::array({issue_to_json({"options.json", "Invalid options JSON", "/options", Severity::error})})}}.dump());
        return static_cast<std::uint32_t>(global_text_output.size());
    }
    const auto fmt_str = parsed_opts.value("format", std::string{"png"});
    const auto parsed_format = format_from_string(fmt_str);
    if (!parsed_format) {
        set_text_output(Json{{"ok", false}, {"issues", Json::array({issue_to_json({"output.format", "Unsupported export format", "/output/format", Severity::error})})}}.dump());
        return static_cast<std::uint32_t>(global_text_output.size());
    }
    RenderOptions common;
    bool bg_ok = true;
    populate_common_options(parsed_opts, common, bg_ok);
    if (!bg_ok) {
        set_text_output(Json{{"ok", false}, {"issues", Json::array({issue_to_json({"output.background", "Invalid background color", "/output/background", Severity::error})})}}.dump());
        return static_cast<std::uint32_t>(global_text_output.size());
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

    auto result = global_engine.export_image(source, options);
    Json issues = Json::array();
    for (const auto& issue : result.issues) {
        issues.push_back(issue_to_json(issue));
    }
    const auto ok = result.ok();
    if (ok) {
        global_binary_output = std::move(result.data);
    }
    set_text_output(Json{
        {"ok", ok},
        {"sizeBytes", global_binary_output.size()},
        {"width", result.width},
        {"height", result.height},
        {"hasAlpha", result.has_alpha},
        {"bounds", bounds_to_json(result.source_bounds)},
        {"issues", std::move(issues)}
    }.dump());
    return static_cast<std::uint32_t>(global_text_output.size());
}

__attribute__((export_name("ve_measure_bounds")))
std::uint32_t ve_measure_bounds(
    const char* src_ptr,
    std::uint32_t src_len,
    const char* opt_ptr,
    std::uint32_t opt_len
) {
    const std::string_view source{src_ptr, src_len};
    const std::string_view opt_view{opt_ptr, opt_len};
    const auto parsed_opts = Json::parse(opt_view.begin(), opt_view.end(), nullptr, false, false);
    ExportTarget target;
    bool include_hidden = false;
    if (parsed_opts.is_object()) {
        if (const auto t_it = parsed_opts.find("target"); t_it != parsed_opts.end()) {
            target = parse_target_json(*t_it);
        }
        include_hidden = parsed_opts.value("includeHidden", false);
    }
    const auto [bounds, issues] = global_engine.measure_bounds(source, target, include_hidden);
    Json out_issues = Json::array();
    for (const auto& issue : issues) {
        out_issues.push_back(issue_to_json(issue));
    }
    set_text_output(Json{
        {"hasBounds", bounds.has_value()},
        {"bounds", bounds ? bounds_to_json(*bounds) : Json(nullptr)},
        {"issues", std::move(out_issues)}
    }.dump());
    return static_cast<std::uint32_t>(global_text_output.size());
}

}
