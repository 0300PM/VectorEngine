#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include <nlohmann/json.hpp>

#include "vector_engine/engine.hpp"
#include "vector_engine/parser.hpp"

namespace vector_engine::bindings {

using Json = nlohmann::json;

[[nodiscard]] inline auto issue_to_json(const Issue& issue) -> Json {
    return {
        {"code", issue.code},
        {"message", issue.message},
        {"path", issue.path},
        {"severity", issue.severity == Severity::error ? "error" : "warning"}
    };
}

[[nodiscard]] inline auto bounds_to_json(const BoundingBox& box) -> Json {
    return {
        {"x", box.min_x},
        {"y", box.min_y},
        {"width", box.width()},
        {"height", box.height()}
    };
}

[[nodiscard]] inline auto first_error_message(const std::vector<Issue>& issues, std::string_view fallback) -> std::string {
    for (const auto& issue : issues) {
        if (issue.severity == Severity::error) {
            return issue.message;
        }
    }
    return std::string{fallback};
}

[[nodiscard]] inline auto apply_background_token(
    std::string_view background,
    bool& use_document,
    std::optional<Color>& color
) -> bool {
    if (background == "__DOCUMENT__") {
        use_document = true;
        color = std::nullopt;
        return true;
    }
    use_document = false;
    if (background == "__TRANSPARENT__") {
        color = std::nullopt;
        return true;
    }
    color = parse_color(background);
    return color.has_value();
}

[[nodiscard]] inline auto parse_target_json(const Json& root) -> ExportTarget {
    ExportTarget target;
    if (!root.is_object()) {
        return target;
    }
    if (const auto type_it = root.find("type"); type_it != root.end() && type_it->is_string()) {
        if (const auto kind = target_kind_from_string(type_it->get_ref<const std::string&>())) {
            target.kind = *kind;
        }
    }
    if (const auto id_it = root.find("objectId"); id_it != root.end() && id_it->is_string()) {
        target.id = id_it->get<std::string>();
    } else if (const auto layer_it = root.find("layerId"); layer_it != root.end() && layer_it->is_string()) {
        target.id = layer_it->get<std::string>();
    } else if (const auto ws_it = root.find("workspaceId"); ws_it != root.end() && ws_it->is_string()) {
        target.id = ws_it->get<std::string>();
    }
    if (const auto ids_it = root.find("objectIds"); ids_it != root.end() && ids_it->is_array()) {
        target.ids.reserve(ids_it->size());
        for (const auto& item : *ids_it) {
            if (item.is_string()) {
                target.ids.push_back(item.get<std::string>());
            }
        }
    }
    if (const auto region_it = root.find("region"); region_it != root.end() && region_it->is_object()) {
        const auto x = region_it->value("x", 0.0);
        const auto y = region_it->value("y", 0.0);
        const auto w = region_it->value("width", 0.0);
        const auto h = region_it->value("height", 0.0);
        target.region = BoundingBox{x, y, x + w, y + h};
    }
    return target;
}

inline void populate_common_options(
    const Json& json,
    RenderOptions& render,
    bool& background_valid
) {
    background_valid = true;
    if (const auto w_it = json.find("width"); w_it != json.end() && w_it->is_number()) {
        const auto val = w_it->get<double>();
        render.width = val > 0.0 ? static_cast<std::uint32_t>(val) : 0U;
    }
    if (const auto h_it = json.find("height"); h_it != json.end() && h_it->is_number()) {
        const auto val = h_it->get<double>();
        render.height = val > 0.0 ? static_cast<std::uint32_t>(val) : 0U;
    }
    if (const auto s_it = json.find("scale"); s_it != json.end() && s_it->is_number()) {
        render.scale = s_it->get<double>();
    }
    if (const auto target_it = json.find("target"); target_it != json.end()) {
        render.target = parse_target_json(*target_it);
    }
    if (const auto hidden_it = json.find("includeHidden"); hidden_it != json.end() && hidden_it->is_boolean()) {
        render.include_hidden = hidden_it->get<bool>();
    }
    if (const auto trim_it = json.find("trimToBounds"); trim_it != json.end() && trim_it->is_boolean()) {
        render.trim_to_bounds = trim_it->get<bool>();
    }
    if (const auto margin_it = json.find("margin"); margin_it != json.end() && margin_it->is_number()) {
        render.margin = margin_it->get<double>();
    }
    if (const auto clip_it = json.find("clipToBounds"); clip_it != json.end() && clip_it->is_boolean()) {
        render.clip_to_bounds = clip_it->get<bool>();
    }
    if (const auto minify_it = json.find("minifySvg"); minify_it != json.end() && minify_it->is_boolean()) {
        render.minify_svg = minify_it->get<bool>();
    }
    if (const auto fit_it = json.find("fitMode"); fit_it != json.end() && fit_it->is_string()) {
        if (const auto parsed_fit = fit_mode_from_string(fit_it->get_ref<const std::string&>())) {
            render.fit_mode = *parsed_fit;
        }
    } else if (const auto par_it = json.find("preserveAspectRatio"); par_it != json.end() && par_it->is_boolean()) {
        render.fit_mode = par_it->get<bool>() ? FitMode::contain : FitMode::stretch;
    }

    if (const auto bg_it = json.find("background"); bg_it != json.end()) {
        if (bg_it->is_null()) {
            render.use_document_background = false;
            render.background = std::nullopt;
        } else if (bg_it->is_string()) {
            const auto& token = bg_it->get_ref<const std::string&>();
            if (token == "document") {
                render.use_document_background = true;
                render.background = std::nullopt;
            } else if (token == "transparent") {
                render.use_document_background = false;
                render.background = std::nullopt;
            } else {
                background_valid = apply_background_token(token, render.use_document_background, render.background);
            }
        } else if (bg_it->is_object()) {
            if (const auto col_it = bg_it->find("color"); col_it != bg_it->end() && col_it->is_string()) {
                render.use_document_background = false;
                render.background = parse_color(col_it->get_ref<const std::string&>());
                background_valid = render.background.has_value();
            } else {
                background_valid = false;
            }
        }
    }
}

}
