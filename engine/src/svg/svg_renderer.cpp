#include "vector_engine/svg_renderer.hpp"

#include <array>
#include <cmath>
#include <iomanip>
#include <locale>
#include <sstream>
#include <string>
#include <type_traits>

namespace vector_engine {

namespace {

[[nodiscard]] auto number(double value) -> std::string {
    if (std::abs(value) < 1.0e-12) {
        return "0";
    }
    std::ostringstream stream;
    stream.imbue(std::locale::classic());
    stream << std::setprecision(12) << std::defaultfloat << value;
    return stream.str();
}

[[nodiscard]] auto hexadecimal(std::uint8_t value) -> std::string {
    constexpr std::array digits{'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'};
    std::string result(2, '0');
    result[0] = digits[value >> 4U];
    result[1] = digits[value & 0x0FU];
    return result;
}

[[nodiscard]] auto color_value(Color color) -> std::string {
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

[[nodiscard]] auto points_value(const std::vector<Point>& points) -> std::string {
    std::string result;
    for (std::size_t index = 0; index < points.size(); ++index) {
        if (index != 0U) {
            result.push_back(' ');
        }
        result += number(points[index].x);
        result.push_back(',');
        result += number(points[index].y);
    }
    return result;
}

[[nodiscard]] auto style_attributes(const Node& node) -> std::string {
    std::string result = " id=\"" + escape_xml(node.id, true) + "\"";
    result += " fill=\"" + (node.style.fill ? color_value(*node.style.fill) : std::string{"none"}) + "\"";
    result += " stroke=\"" + (node.style.stroke ? color_value(*node.style.stroke) : std::string{"none"}) + "\"";
    if (node.style.stroke) {
        result += " stroke-width=\"" + number(node.style.stroke_width) + "\"";
    }
    if (node.style.opacity < 1.0) {
        result += " opacity=\"" + number(node.style.opacity) + "\"";
    }
    if (!node.transform.is_identity()) {
        result += " transform=\"matrix(" + number(node.transform.a) + " " + number(node.transform.b) + " " +
            number(node.transform.c) + " " + number(node.transform.d) + " " + number(node.transform.e) + " " +
            number(node.transform.f) + ")\"";
    }
    return result;
}

void render_node(const Node& node, std::string& output) {
    if (!node.style.visible) {
        return;
    }

    std::visit([&](const auto& geometry) {
        using Type = std::decay_t<decltype(geometry)>;
        const auto attributes = style_attributes(node);
        if constexpr (std::is_same_v<Type, Rectangle>) {
            output += "<rect" + attributes + " x=\"" + number(geometry.x) + "\" y=\"" + number(geometry.y) +
                "\" width=\"" + number(geometry.width) + "\" height=\"" + number(geometry.height) + "\"";
            if (geometry.radius_x > 0.0) {
                output += " rx=\"" + number(geometry.radius_x) + "\"";
            }
            if (geometry.radius_y > 0.0) {
                output += " ry=\"" + number(geometry.radius_y) + "\"";
            }
            output += "/>";
        } else if constexpr (std::is_same_v<Type, Circle>) {
            output += "<circle" + attributes + " cx=\"" + number(geometry.center_x) + "\" cy=\"" +
                number(geometry.center_y) + "\" r=\"" + number(geometry.radius) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Ellipse>) {
            output += "<ellipse" + attributes + " cx=\"" + number(geometry.center_x) + "\" cy=\"" +
                number(geometry.center_y) + "\" rx=\"" + number(geometry.radius_x) + "\" ry=\"" +
                number(geometry.radius_y) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Line>) {
            output += "<line" + attributes + " x1=\"" + number(geometry.start.x) + "\" y1=\"" +
                number(geometry.start.y) + "\" x2=\"" + number(geometry.end.x) + "\" y2=\"" +
                number(geometry.end.y) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Polygon>) {
            output += "<polygon" + attributes + " points=\"" + points_value(geometry.points) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Polyline>) {
            output += "<polyline" + attributes + " points=\"" + points_value(geometry.points) + "\"/>";
        } else if constexpr (std::is_same_v<Type, Path>) {
            output += "<path" + attributes + " d=\"" + escape_xml(geometry.data, true) + "\" fill-rule=\"" +
                (geometry.fill_rule == FillRule::evenodd ? "evenodd" : "nonzero") + "\"/>";
        } else if constexpr (std::is_same_v<Type, Text>) {
            auto anchor = std::string{"start"};
            if (geometry.anchor == TextAnchor::middle) {
                anchor = "middle";
            } else if (geometry.anchor == TextAnchor::end) {
                anchor = "end";
            }
            output += "<text" + attributes + " x=\"" + number(geometry.x) + "\" y=\"" + number(geometry.y) +
                "\" font-size=\"" + number(geometry.font_size) + "\" font-family=\"" +
                escape_xml(geometry.font_family, true) + "\" font-weight=\"" + std::to_string(geometry.font_weight) +
                "\" text-anchor=\"" + anchor + "\"";
            if (std::abs(geometry.letter_spacing) > 1.0e-12) {
                output += " letter-spacing=\"" + number(geometry.letter_spacing) + "\"";
            }
            output += ">" + escape_xml(geometry.content, false) + "</text>";
        } else if constexpr (std::is_same_v<Type, std::shared_ptr<Group>>) {
            output += "<g" + attributes + ">";
            if (geometry) {
                for (const auto& child : geometry->children) {
                    render_node(child, output);
                }
            }
            output += "</g>";
        }
    }, node.geometry);
}

}

auto render_svg_scene(const Scene& scene, const RenderOptions& options) -> std::string {
    const auto width = options.width == 0U ? scene.document.width : options.width;
    const auto height = options.height == 0U ? scene.document.height : options.height;
    const auto background = options.use_document_background ? scene.document.background : options.background;

    std::string output;
    output.reserve(512U + scene.objects.size() * 128U);
    output += "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + std::to_string(width) +
        "\" height=\"" + std::to_string(height) + "\" viewBox=\"0 0 " + std::to_string(scene.document.width) +
        " " + std::to_string(scene.document.height) + "\" role=\"img\" aria-label=\"Vector Engine output\" "
        "shape-rendering=\"geometricPrecision\">";
    if (background) {
        output += "<rect width=\"100%\" height=\"100%\" fill=\"" + color_value(*background) + "\"/>";
    }
    for (const auto& node : scene.objects) {
        render_node(node, output);
    }
    output += "</svg>";
    return output;
}

}
