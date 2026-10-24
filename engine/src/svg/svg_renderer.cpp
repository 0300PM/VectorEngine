#include "vector_engine/svg_renderer.hpp"

#include <array>
#include <cmath>
#include <iomanip>
#include <locale>
#include <sstream>
#include <string>
#include <type_traits>
#include <unordered_set>

namespace vector_engine {

namespace {

[[nodiscard]] auto number(double value, bool compact = false) -> std::string {
    if (std::abs(value) < 1.0e-12) {
        return "0";
    }
    std::ostringstream stream;
    stream.imbue(std::locale::classic());
    stream << std::setprecision(compact ? 6 : 12) << std::defaultfloat << value;
    return stream.str();
}

[[nodiscard]] auto hexadecimal(std::uint8_t value) -> std::string {
    constexpr std::array digits{'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'};
    std::string result(2, '0');
    result[0] = digits[value >> 4U];
    result[1] = digits[value & 0x0FU];
    return result;
}

[[nodiscard]] auto color_value(Color color, bool compact = false) -> std::string {
    if (compact && color.alpha == 255U &&
        (color.red >> 4U) == (color.red & 0x0FU) &&
        (color.green >> 4U) == (color.green & 0x0FU) &&
        (color.blue >> 4U) == (color.blue & 0x0FU)) {
        constexpr std::array digits{'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'};
        std::string short_hex{"#000"};
        short_hex[1] = digits[color.red & 0x0FU];
        short_hex[2] = digits[color.green & 0x0FU];
        short_hex[3] = digits[color.blue & 0x0FU];
        return short_hex;
    }
    auto result = std::string{"#"};
    result += hexadecimal(color.red);
    result += hexadecimal(color.green);
    result += hexadecimal(color.blue);
    if (color.alpha != 255U) {
        result += hexadecimal(color.alpha);
    }
    return result;
}

[[nodiscard]] auto escape_xml(std::string_view value, bool attribute) -> std::string {
    std::string result;
    result.reserve(value.size());
    for (const auto character : value) {
        switch (character) {
            case '&': result += "&amp;"; break;
            case '<': result += "&lt;"; break;
            case '>': result += "&gt;"; break;
            case '"': result += attribute ? "&quot;" : "\""; break;
            case '\'': result += attribute ? "&apos;" : "'"; break;
            default: result.push_back(character); break;
        }
    }
    return result;
}

[[nodiscard]] auto compact_path_data(std::string_view source) -> std::string {
    std::string result;
    result.reserve(source.size());
    bool previous_was_space = true;
    for (std::size_t index = 0; index < source.size(); ++index) {
        const auto ch = source[index];
        if (ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n') {
            if (!previous_was_space) {
                result.push_back(' ');
                previous_was_space = true;
            }
            continue;
        }
        const auto is_cmd = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
        if (is_cmd && ch != 'e' && ch != 'E') {
            if (!result.empty() && result.back() == ' ') {
                result.pop_back();
            }
            result.push_back(ch);
            previous_was_space = true;
            continue;
        }
        if (ch == ',' && !result.empty() && result.back() == ' ') {
            result.pop_back();
        }
        result.push_back(ch);
        previous_was_space = ch == ',';
    }
    if (!result.empty() && result.back() == ' ') {
        result.pop_back();
    }
    return result;
}

[[nodiscard]] auto blend_mode_name(BlendMode mode) -> std::string_view {
    switch (mode) {
        case BlendMode::normal: return "normal";
        case BlendMode::multiply: return "multiply";
        case BlendMode::screen: return "screen";
        case BlendMode::overlay: return "overlay";
        case BlendMode::darken: return "darken";
        case BlendMode::lighten: return "lighten";
    }
    return "normal";
}

[[nodiscard]] auto points_value(const std::vector<Point>& points, bool compact) -> std::string {
    std::string result;
    for (std::size_t index = 0; index < points.size(); ++index) {
        if (index != 0U) {
            result.push_back(' ');
        }
        result += number(points[index].x, compact);
        result.push_back(',');
        result += number(points[index].y, compact);
    }
    return result;
}

[[nodiscard]] auto paint_attribute(
    const std::optional<Color>& solid,
    const std::optional<std::string>& gradient_id,
    bool compact
) -> std::string {
    if (gradient_id) {
        return "url(#" + escape_xml(*gradient_id, true) + ")";
    }
    if (solid) {
        return color_value(*solid, compact);
    }
    return "none";
}

[[nodiscard]] auto style_attributes(const Node& node, bool compact) -> std::string {
    std::string result;
    if (!compact || !node.id.empty()) {
        result += " id=\"" + escape_xml(node.id, true) + "\"";
    }
    const auto fill_val = paint_attribute(node.style.fill, node.style.fill_gradient_id, compact);
    const auto stroke_val = paint_attribute(node.style.stroke, node.style.stroke_gradient_id, compact);
    result += " fill=\"" + fill_val + "\"";
    if (!compact || stroke_val != "none") {
        result += " stroke=\"" + stroke_val + "\"";
    }
    if (node.style.stroke || node.style.stroke_gradient_id) {
        result += " stroke-width=\"" + number(node.style.stroke_width, compact) + "\"";
    }
    if (node.style.opacity < 1.0) {
        result += " opacity=\"" + number(node.style.opacity, compact) + "\"";
    }
    if (node.style.blend_mode != BlendMode::normal) {
        result += " style=\"mix-blend-mode:" + std::string{blend_mode_name(node.style.blend_mode)} + "\"";
    }
    if (!node.transform.is_identity()) {
        result += " transform=\"matrix(" + number(node.transform.a, compact) + " " + number(node.transform.b, compact) + " " +
            number(node.transform.c, compact) + " " + number(node.transform.d, compact) + " " +
            number(node.transform.e, compact) + " " + number(node.transform.f, compact) + ")\"";
    }
    return result;
}

void collect_used_gradients(const Node& node, std::unordered_set<std::string>& used) {
    if (node.style.fill_gradient_id) {
        used.insert(*node.style.fill_gradient_id);
    }
    if (node.style.stroke_gradient_id) {
        used.insert(*node.style.stroke_gradient_id);
    }
    if (const auto* group = std::get_if<std::shared_ptr<Group>>(&node.geometry); group && *group) {
        for (const auto& child : (*group)->children) {
            collect_used_gradients(child, used);
        }
    }
}

void render_gradient_stops(const std::vector<GradientStop>& stops, bool compact, std::string& output) {
    for (const auto& stop : stops) {
        output += "<stop offset=\"" + number(stop.offset, compact) + "\" stop-color=\"" +
            color_value(stop.color, compact) + "\"";
        if (stop.opacity < 1.0) {
            output += " stop-opacity=\"" + number(stop.opacity, compact) + "\"";
        }
        output += "/>";
    }
}

void render_gradient(const Gradient& gradient, bool compact, std::string& output) {
    const auto spread_attr = [](SpreadMethod spread) -> std::string_view {
        switch (spread) {
            case SpreadMethod::pad: return "";
            case SpreadMethod::reflect: return " spreadMethod=\"reflect\"";
            case SpreadMethod::repeat: return " spreadMethod=\"repeat\"";
        }
        return "";
    };
    const auto units_attr = [](GradientUnits units) -> std::string_view {
        return units == GradientUnits::user_space_on_use ? " gradientUnits=\"userSpaceOnUse\"" : "";
    };

    std::visit([&](const auto& item) {
        using Type = std::decay_t<decltype(item)>;
        if constexpr (std::is_same_v<Type, LinearGradient>) {
            output += "<linearGradient id=\"" + escape_xml(item.id, true) + "\" x1=\"" + number(item.x1, compact) +
                "\" y1=\"" + number(item.y1, compact) + "\" x2=\"" + number(item.x2, compact) +
                "\" y2=\"" + number(item.y2, compact) + "\"" + std::string{units_attr(item.units)} +
                std::string{spread_attr(item.spread)} + ">";
            render_gradient_stops(item.stops, compact, output);
            output += "</linearGradient>";
        } else {
            output += "<radialGradient id=\"" + escape_xml(item.id, true) + "\" cx=\"" + number(item.cx, compact) +
                "\" cy=\"" + number(item.cy, compact) + "\" r=\"" + number(item.r, compact) + "\"";
            if (item.fx) {
                output += " fx=\"" + number(*item.fx, compact) + "\"";
            }
            if (item.fy) {
                output += " fy=\"" + number(*item.fy, compact) + "\"";
            }
            output += std::string{units_attr(item.units)} + std::string{spread_attr(item.spread)} + ">";
            render_gradient_stops(item.stops, compact, output);
            output += "</radialGradient>";
        }
    }, gradient);
}

void render_node(const Node& node, bool include_hidden, bool compact, std::string& output) {
    if (!include_hidden && !node.style.visible) {
        return;
    }

    std::visit([&](const auto& geometry) {
        using Type = std::decay_t<decltype(geometry)>;
        const auto attributes = style_attributes(node, compact);
        if constexpr (std::is_same_v<Type, Rectangle>) {
            output += "<rect" + attributes + " x=\"" + number(geometry.x, compact) + "\" y=\"" + number(geometry.y, compact) +
                "\" width=\"" + number(geometry.width, compact) + "\" height=\"" + number(geometry.height, compact) + "\"";
            if (geometry.radius_x > 0.0) {
                output += " rx=\"" + number(geometry.radius_x, compact) + "\"";
            }
            if (geometry.radius_y > 0.0) {
                output += " ry=\"" + number(geometry.radius_y, compact) + "\"";
            }
            output += "/>";
        } else if constexpr (std::is_same_v<Type, Circle>) {
            output += "<circle" + attributes + " cx=\"" + number(geometry.center_x, compact) + "\" cy=\"" +
                number(geometry.center_y, compact) + "\" r=\"" + number(geometry.radius, compact) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Ellipse>) {
            output += "<ellipse" + attributes + " cx=\"" + number(geometry.center_x, compact) + "\" cy=\"" +
                number(geometry.center_y, compact) + "\" rx=\"" + number(geometry.radius_x, compact) + "\" ry=\"" +
                number(geometry.radius_y, compact) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Line>) {
            output += "<line" + attributes + " x1=\"" + number(geometry.start.x, compact) + "\" y1=\"" +
                number(geometry.start.y, compact) + "\" x2=\"" + number(geometry.end.x, compact) + "\" y2=\"" +
                number(geometry.end.y, compact) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Polygon>) {
            output += "<polygon" + attributes + " points=\"" + points_value(geometry.points, compact) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Polyline>) {
            output += "<polyline" + attributes + " points=\"" + points_value(geometry.points, compact) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Path>) {
            const auto d_value = compact ? compact_path_data(geometry.data) : geometry.data;
            output += "<path" + attributes + " d=\"" + escape_xml(d_value, true) + "\"";
            if (!compact || geometry.fill_rule == FillRule::evenodd) {
                output += " fill-rule=\"" + std::string{geometry.fill_rule == FillRule::evenodd ? "evenodd" : "nonzero"} + "\"";
            }
            output += "/>";
        } else if constexpr (std::is_same_v<Type, Text>) {
            auto anchor = std::string{"start"};
            if (geometry.anchor == TextAnchor::middle) {
                anchor = "middle";
            } else if (geometry.anchor == TextAnchor::end) {
                anchor = "end";
            }
            output += "<text" + attributes + " x=\"" + number(geometry.x, compact) + "\" y=\"" + number(geometry.y, compact) +
                "\" font-size=\"" + number(geometry.font_size, compact) + "\" font-family=\"" +
                escape_xml(geometry.font_family, true) + "\"";
            if (!compact || geometry.font_weight != 400) {
                output += " font-weight=\"" + std::to_string(geometry.font_weight) + "\"";
            }
            if (!compact || anchor != "start") {
                output += " text-anchor=\"" + anchor + "\"";
            }
            if (std::abs(geometry.letter_spacing) > 1.0e-12) {
                output += " letter-spacing=\"" + number(geometry.letter_spacing, compact) + "\"";
            }
            output += ">" + escape_xml(geometry.content, false) + "</text>";
        } else if constexpr (std::is_same_v<Type, std::shared_ptr<Group>>) {
            output += "<g" + attributes + ">";
            if (geometry) {
                for (const auto& child : geometry->children) {
                    render_node(child, include_hidden, compact, output);
                }
            }
            output += "</g>";
        }
    }, node.geometry);
}

}

auto render_svg_viewport(const Scene& scene, const Viewport& viewport, const RenderOptions& options) -> std::string {
    const auto background = options.use_document_background ? scene.document.background : options.background;
    const auto compact = options.minify_svg;

    std::unordered_set<std::string> used_gradients;
    for (const auto& layer : scene.layers) {
        if (!options.include_hidden && !layer.visible) {
            continue;
        }
        for (const auto& node : layer.objects) {
            collect_used_gradients(node, used_gradients);
        }
    }
    for (const auto& node : scene.objects) {
        collect_used_gradients(node, used_gradients);
    }

    std::string defs;
    for (const auto& gradient : scene.gradients) {
        const auto& id = std::visit([](const auto& item) -> const std::string& { return item.id; }, gradient);
        if (used_gradients.contains(id)) {
            render_gradient(gradient, compact, defs);
        }
    }
    if (viewport.clip_to_source) {
        defs += "<clipPath id=\"ve-export-clip\"><rect x=\"" + number(viewport.source_box.min_x, compact) +
            "\" y=\"" + number(viewport.source_box.min_y, compact) + "\" width=\"" +
            number(viewport.source_box.width(), compact) + "\" height=\"" +
            number(viewport.source_box.height(), compact) + "\"/></clipPath>";
    }

    std::string output;
    output.reserve(512U + scene.objects.size() * 128U + defs.size());
    output += "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + std::to_string(viewport.output_width) +
        "\" height=\"" + std::to_string(viewport.output_height) + "\" viewBox=\"" +
        number(viewport.view_box.min_x, compact) + " " + number(viewport.view_box.min_y, compact) + " " +
        number(viewport.view_box.width(), compact) + " " + number(viewport.view_box.height(), compact) + "\"";
    if (viewport.fit_mode == FitMode::cover) {
        output += " preserveAspectRatio=\"xMidYMid slice\"";
    } else if (viewport.fit_mode == FitMode::stretch) {
        output += " preserveAspectRatio=\"none\"";
    }
    if (!compact) {
        output += " role=\"img\" aria-label=\"Vector Engine output\" shape-rendering=\"geometricPrecision\"";
    }
    output += ">";

    if (!defs.empty()) {
        output += "<defs>" + defs + "</defs>";
    }
    if (background) {
        output += "<rect x=\"" + number(viewport.view_box.min_x, compact) + "\" y=\"" +
            number(viewport.view_box.min_y, compact) + "\" width=\"" +
            number(viewport.view_box.width(), compact) + "\" height=\"" +
            number(viewport.view_box.height(), compact) + "\" fill=\"" +
            color_value(*background, compact) + "\"/>";
    }
    if (viewport.clip_to_source) {
        output += "<g clip-path=\"url(#ve-export-clip)\">";
    }
    for (const auto& layer : scene.layers) {
        if (!options.include_hidden && !layer.visible) {
            continue;
        }
        output += "<g id=\"" + escape_xml(layer.id, true) + "\" data-layer=\"" + escape_xml(layer.id, true) + "\"";
        if (layer.opacity < 1.0) {
            output += " opacity=\"" + number(layer.opacity, compact) + "\"";
        }
        output += ">";
        for (const auto& node : layer.objects) {
            render_node(node, options.include_hidden, compact, output);
        }
        output += "</g>";
    }
    for (const auto& node : scene.objects) {
        render_node(node, options.include_hidden, compact, output);
    }
    if (viewport.clip_to_source) {
        output += "</g>";
    }
    output += "</svg>";
    return output;
}

auto render_svg_scene(const Scene& scene, const RenderOptions& options) -> std::string {
    std::vector<Issue> ignored_issues;
    const auto scoped = prepare_scoped_scene(scene, options.target, options.include_hidden, ignored_issues);
    const auto& active_scene = scoped ? *scoped : scene;
    const auto viewport = resolve_viewport(scene, active_scene, options, 0ULL, ignored_issues);
    if (!viewport) {
        const auto width = options.width == 0U ? scene.document.width : options.width;
        const auto height = options.height == 0U ? scene.document.height : options.height;
        const Viewport fallback{
            {0.0, 0.0, static_cast<double>(scene.document.width), static_cast<double>(scene.document.height)},
            {0.0, 0.0, static_cast<double>(scene.document.width), static_cast<double>(scene.document.height)},
            width,
            height,
            options.fit_mode,
            false,
            Matrix::identity()
        };
        return render_svg_viewport(active_scene, fallback, options);
    }
    return render_svg_viewport(active_scene, *viewport, options);
}

}
