#include "vector_engine/parser.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <limits>
#include <optional>
#include <ranges>
#include <string>
#include <string_view>
#include <unordered_set>
#include <utility>

#include <nlohmann/json.hpp>

#include "vector_engine/path.hpp"

namespace vector_engine {

namespace {

using Json = nlohmann::json;

constexpr std::size_t maximum_source_size = 4U * 1024U * 1024U;
constexpr std::uint32_t maximum_dimension = 16'384U;
constexpr std::uint64_t maximum_pixels = 67'108'864ULL;
constexpr std::size_t maximum_objects = 10'000U;
constexpr std::size_t maximum_depth = 32U;
constexpr std::size_t maximum_path_size = 1'000'000U;
constexpr double maximum_coordinate = 1'000'000.0;

struct ParseContext {
    std::vector<Issue> issues;
    std::unordered_set<std::string> ids;
    std::unordered_set<std::string> gradient_ids;
    std::unordered_set<std::string> layer_ids;
    std::vector<std::pair<std::string, std::string>> referenced_gradients;
    std::size_t object_count{};
    bool object_limit_reported{};

    void error(std::string code, std::string message, std::string path) {
        issues.push_back({std::move(code), std::move(message), std::move(path), Severity::error});
    }

    void warning(std::string code, std::string message, std::string path) {
        issues.push_back({std::move(code), std::move(message), std::move(path), Severity::warning});
    }
};

[[nodiscard]] auto member_path(std::string_view path, std::string_view key) -> std::string {
    auto result = std::string{path};
    result.push_back('/');
    result.append(key);
    return result;
}

[[nodiscard]] auto index_path(std::string_view path, std::size_t index) -> std::string {
    return member_path(path, std::to_string(index));
}

[[nodiscard]] auto is_finite_number(const Json& value) -> bool {
    return value.is_number() && std::isfinite(value.get<double>());
}

[[nodiscard]] auto required_number(
    const Json& object,
    std::string_view key,
    std::string_view path,
    ParseContext& context,
    double minimum = -maximum_coordinate,
    double maximum = maximum_coordinate
) -> std::optional<double> {
    const auto iterator = object.find(key);
    const auto target_path = member_path(path, key);
    if (iterator == object.end()) {
        context.error("schema.required", "Required property is missing", target_path);
        return std::nullopt;
    }
    if (!is_finite_number(*iterator)) {
        context.error("schema.type", "Expected a finite number", target_path);
        return std::nullopt;
    }
    const auto value = iterator->get<double>();
    if (value < minimum || value > maximum) {
        context.error("schema.range", "Number is outside the supported range", target_path);
        return std::nullopt;
    }
    return value;
}

[[nodiscard]] auto optional_number(
    const Json& object,
    std::string_view key,
    std::string_view path,
    ParseContext& context,
    double minimum,
    double maximum
) -> std::optional<double> {
    const auto iterator = object.find(key);
    if (iterator == object.end()) {
        return std::nullopt;
    }
    const auto target_path = member_path(path, key);
    if (!is_finite_number(*iterator)) {
        context.error("schema.type", "Expected a finite number", target_path);
        return std::nullopt;
    }
    const auto value = iterator->get<double>();
    if (value < minimum || value > maximum) {
        context.error("schema.range", "Number is outside the supported range", target_path);
        return std::nullopt;
    }
    return value;
}

[[nodiscard]] auto required_string(
    const Json& object,
    std::string_view key,
    std::string_view path,
    ParseContext& context,
    std::size_t maximum_size
) -> std::optional<std::string> {
    const auto iterator = object.find(key);
    const auto target_path = member_path(path, key);
    if (iterator == object.end()) {
        context.error("schema.required", "Required property is missing", target_path);
        return std::nullopt;
    }
    if (!iterator->is_string()) {
        context.error("schema.type", "Expected a string", target_path);
        return std::nullopt;
    }
    auto value = iterator->get<std::string>();
    if (value.size() > maximum_size) {
        context.error("limit.string", "String exceeds the supported length", target_path);
        return std::nullopt;
    }
    return value;
}

[[nodiscard]] auto is_valid_id(std::string_view id) -> bool {
    if (id.empty() || id.size() > 128U) {
        return false;
    }
    const auto is_alpha = [](char character) {
        return (character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z');
    };
    const auto is_digit = [](char character) {
        return character >= '0' && character <= '9';
    };
    if (!is_alpha(id.front())) {
        return false;
    }
    return std::ranges::all_of(id.substr(1), [&](char character) {
        return is_alpha(character) || is_digit(character) || character == '_' || character == '.' ||
            character == ':' || character == '-';
    });
}

[[nodiscard]] auto is_common_key(std::string_view key) -> bool {
    constexpr std::array keys{
        std::string_view{"id"},
        std::string_view{"name"},
        std::string_view{"layerId"},
        std::string_view{"type"},
        std::string_view{"fill"},
        std::string_view{"stroke"},
        std::string_view{"strokeWidth"},
        std::string_view{"opacity"},
        std::string_view{"blendMode"},
        std::string_view{"transform"},
        std::string_view{"visible"}
    };
    return std::ranges::find(keys, key) != keys.end();
}

void reject_unknown_keys(
    const Json& object,
    std::string_view path,
    ParseContext& context,
    std::initializer_list<std::string_view> specific_keys
) {
    for (const auto& [key, value] : object.items()) {
        static_cast<void>(value);
        if (is_common_key(key) || std::ranges::find(specific_keys, key) != specific_keys.end()) {
            continue;
        }
        if (key == "filter" || key == "mask" || key == "clipPath") {
            context.error("unsupported." + key, "Unsupported vector effect property: " + key, member_path(path, key));
            continue;
        }
        context.error("schema.additionalProperties", "Unsupported property", member_path(path, key));
    }
}

void parse_paint_channel(
    const Json& object,
    std::string_view key,
    std::string_view path,
    ParseContext& context,
    std::optional<Color> fallback,
    std::optional<Color>& out_color,
    std::optional<std::string>& out_gradient
) {
    const auto iterator = object.find(key);
    if (iterator == object.end()) {
        out_color = fallback;
        out_gradient = std::nullopt;
        return;
    }
    const auto target_path = member_path(path, key);
    if (!iterator->is_string()) {
        context.error("schema.type", "Expected a paint string", target_path);
        out_color = fallback;
        return;
    }
    const auto value = iterator->get<std::string>();
    if (value == "none") {
        out_color = std::nullopt;
        out_gradient = std::nullopt;
        return;
    }
    if (value.starts_with("url(#") && value.ends_with(')') && value.size() > 6U) {
        auto grad_id = value.substr(5U, value.size() - 6U);
        if (!is_valid_id(grad_id)) {
            context.error("schema.paint", "Gradient reference identifier is invalid", target_path);
            out_color = fallback;
            return;
        }
        out_color = std::nullopt;
        out_gradient = grad_id;
        context.referenced_gradients.emplace_back(std::move(grad_id), target_path);
        return;
    }
    const auto color = parse_color(value);
    if (!color) {
        context.error("schema.color", "Expected a hexadecimal color or url(#gradient) reference", target_path);
        out_color = fallback;
        return;
    }
    out_color = color;
    out_gradient = std::nullopt;
}

[[nodiscard]] auto parse_style(
    const Json& object,
    std::string_view type,
    std::string_view path,
    ParseContext& context
) -> Style {
    const auto default_fill = type == "line" || type == "polyline" || type == "group"
        ? std::optional<Color>{}
        : std::optional<Color>{Color{23, 23, 23, 255}};
    const auto default_stroke = type == "line" || type == "polyline"
        ? std::optional<Color>{Color{23, 23, 23, 255}}
        : std::optional<Color>{};

    Style style;
    parse_paint_channel(object, "fill", path, context, default_fill, style.fill, style.fill_gradient_id);
    parse_paint_channel(object, "stroke", path, context, default_stroke, style.stroke, style.stroke_gradient_id);
    style.stroke_width = optional_number(object, "strokeWidth", path, context, 0.0, 10'000.0).value_or(1.0);
    style.opacity = optional_number(object, "opacity", path, context, 0.0, 1.0).value_or(1.0);

    if (const auto iterator = object.find("blendMode"); iterator != object.end()) {
        const auto blend_path = member_path(path, "blendMode");
        if (!iterator->is_string()) {
            context.error("schema.type", "Expected a string blend mode", blend_path);
        } else {
            const auto& mode = iterator->get_ref<const std::string&>();
            if (mode == "normal") {
                style.blend_mode = BlendMode::normal;
            } else if (mode == "multiply") {
                style.blend_mode = BlendMode::multiply;
            } else if (mode == "screen") {
                style.blend_mode = BlendMode::screen;
            } else if (mode == "overlay") {
                style.blend_mode = BlendMode::overlay;
            } else if (mode == "darken") {
                style.blend_mode = BlendMode::darken;
            } else if (mode == "lighten") {
                style.blend_mode = BlendMode::lighten;
            } else {
                context.error("unsupported.blendMode", "Unsupported blend mode: " + mode, blend_path);
            }
        }
    }

    if (const auto iterator = object.find("visible"); iterator != object.end()) {
        if (iterator->is_boolean()) {
            style.visible = iterator->get<bool>();
        } else {
            context.error("schema.type", "Expected a boolean", member_path(path, "visible"));
        }
    }
    return style;
}

[[nodiscard]] auto parse_transform(const Json& object, std::string_view path, ParseContext& context) -> Matrix {
    const auto iterator = object.find("transform");
    if (iterator == object.end()) {
        return Matrix::identity();
    }
    const auto transform_path = member_path(path, "transform");
    if (!iterator->is_object()) {
        context.error("schema.type", "Expected a transform object", transform_path);
        return Matrix::identity();
    }

    constexpr std::array allowed_keys{
        std::string_view{"translateX"},
        std::string_view{"translateY"},
        std::string_view{"rotate"},
        std::string_view{"scaleX"},
        std::string_view{"scaleY"},
        std::string_view{"skewX"},
        std::string_view{"skewY"},
        std::string_view{"originX"},
        std::string_view{"originY"}
    };
    for (const auto& [key, value] : iterator->items()) {
        static_cast<void>(value);
        if (std::ranges::find(allowed_keys, key) == allowed_keys.end()) {
            context.error("schema.additionalProperties", "Unsupported transform property", member_path(transform_path, key));
        }
    }

    const auto translate_x = optional_number(*iterator, "translateX", transform_path, context, -maximum_coordinate, maximum_coordinate).value_or(0.0);
    const auto translate_y = optional_number(*iterator, "translateY", transform_path, context, -maximum_coordinate, maximum_coordinate).value_or(0.0);
    const auto rotation = optional_number(*iterator, "rotate", transform_path, context, -maximum_coordinate, maximum_coordinate).value_or(0.0);
    const auto scale_x = optional_number(*iterator, "scaleX", transform_path, context, -1'000.0, 1'000.0).value_or(1.0);
    const auto scale_y = optional_number(*iterator, "scaleY", transform_path, context, -1'000.0, 1'000.0).value_or(scale_x);
    const auto skew_x = optional_number(*iterator, "skewX", transform_path, context, -89.0, 89.0).value_or(0.0);
    const auto skew_y = optional_number(*iterator, "skewY", transform_path, context, -89.0, 89.0).value_or(0.0);
    const auto origin_x = optional_number(*iterator, "originX", transform_path, context, -maximum_coordinate, maximum_coordinate).value_or(0.0);
    const auto origin_y = optional_number(*iterator, "originY", transform_path, context, -maximum_coordinate, maximum_coordinate).value_or(0.0);

    return Matrix::translation(translate_x, translate_y) *
        Matrix::translation(origin_x, origin_y) *
        Matrix::rotation(rotation) *
        Matrix::skew_x(skew_x) *
        Matrix::skew_y(skew_y) *
        Matrix::scaling(scale_x, scale_y) *
        Matrix::translation(-origin_x, -origin_y);
}

[[nodiscard]] auto parse_points(
    const Json& object,
    std::string_view path,
    ParseContext& context,
    std::size_t minimum_size
) -> std::vector<Point> {
    std::vector<Point> points;
    const auto iterator = object.find("points");
    const auto points_path = member_path(path, "points");
    if (iterator == object.end()) {
        context.error("schema.required", "Required property is missing", points_path);
        return points;
    }
    if (!iterator->is_array()) {
        context.error("schema.type", "Expected an array of points", points_path);
        return points;
    }
    if (iterator->size() < minimum_size || iterator->size() > 100'000U) {
        context.error("schema.items", "Point count is outside the supported range", points_path);
        return points;
    }

    points.reserve(iterator->size());
    for (std::size_t index = 0; index < iterator->size(); ++index) {
        const auto& value = (*iterator)[index];
        const auto current_path = index_path(points_path, index);
        if (!value.is_object()) {
            context.error("schema.type", "Expected a point object", current_path);
            continue;
        }
        for (const auto& [key, child] : value.items()) {
            static_cast<void>(child);
            if (key != "x" && key != "y") {
                context.error("schema.additionalProperties", "Unsupported point property", member_path(current_path, key));
            }
        }
        const auto x = required_number(value, "x", current_path, context);
        const auto y = required_number(value, "y", current_path, context);
        if (x && y) {
            points.push_back({*x, *y});
        }
    }
    return points;
}

[[nodiscard]] auto parse_node(
    const Json& value,
    std::string_view path,
    ParseContext& context,
    std::size_t depth
) -> std::optional<Node> {
    if (depth > maximum_depth) {
        context.error("limit.depth", "Group nesting exceeds 32 levels", std::string{path});
        return std::nullopt;
    }
    if (!value.is_object()) {
        context.error("schema.type", "Expected a scene object", std::string{path});
        return std::nullopt;
    }

    ++context.object_count;
    if (context.object_count > maximum_objects && !context.object_limit_reported) {
        context.error("limit.objectCount", "Scene contains more than 10000 objects", std::string{path});
        context.object_limit_reported = true;
    }

    const auto id = required_string(value, "id", path, context, 128U);
    const auto type = required_string(value, "type", path, context, 32U);
    if (!id || !type) {
        return std::nullopt;
    }
    if (!is_valid_id(*id)) {
        context.error("schema.id", "Object id has an unsupported format", member_path(path, "id"));
    }
    if (!context.ids.emplace(*id).second) {
        context.error("semantic.duplicateId", "Object id must be unique", member_path(path, "id"));
    }

    Node node;
    node.id = *id;
    if (const auto name_it = value.find("name"); name_it != value.end()) {
        if (!name_it->is_string() || name_it->get_ref<const std::string&>().empty() || name_it->get_ref<const std::string&>().size() > 128U) {
            context.error("schema.name", "Object name must contain 1 to 128 characters", member_path(path, "name"));
        } else {
            node.name = name_it->get<std::string>();
        }
    }
    if (const auto layer_it = value.find("layerId"); layer_it != value.end()) {
        if (!layer_it->is_string() || !is_valid_id(layer_it->get_ref<const std::string&>())) {
            context.error("schema.id", "Layer id has an unsupported format", member_path(path, "layerId"));
        } else {
            node.layer_id = layer_it->get<std::string>();
        }
    }
    node.style = parse_style(value, *type, path, context);
    node.transform = parse_transform(value, path, context);

    if (*type == "rect") {
        reject_unknown_keys(value, path, context, {"x", "y", "width", "height", "rx", "ry"});
        const auto x = required_number(value, "x", path, context);
        const auto y = required_number(value, "y", path, context);
        const auto width = required_number(value, "width", path, context, 0.0, maximum_coordinate);
        const auto height = required_number(value, "height", path, context, 0.0, maximum_coordinate);
        const auto radius_x = optional_number(value, "rx", path, context, 0.0, maximum_coordinate).value_or(0.0);
        const auto radius_y = optional_number(value, "ry", path, context, 0.0, maximum_coordinate).value_or(radius_x);
        node.geometry = Rectangle{x.value_or(0.0), y.value_or(0.0), width.value_or(0.0), height.value_or(0.0), radius_x, radius_y};
    } else if (*type == "circle") {
        reject_unknown_keys(value, path, context, {"cx", "cy", "radius"});
        const auto center_x = required_number(value, "cx", path, context);
        const auto center_y = required_number(value, "cy", path, context);
        const auto radius = required_number(value, "radius", path, context, 0.0, maximum_coordinate);
        node.geometry = Circle{center_x.value_or(0.0), center_y.value_or(0.0), radius.value_or(0.0)};
    } else if (*type == "ellipse") {
        reject_unknown_keys(value, path, context, {"cx", "cy", "rx", "ry"});
        const auto center_x = required_number(value, "cx", path, context);
        const auto center_y = required_number(value, "cy", path, context);
        const auto radius_x = required_number(value, "rx", path, context, 0.0, maximum_coordinate);
        const auto radius_y = required_number(value, "ry", path, context, 0.0, maximum_coordinate);
        node.geometry = Ellipse{center_x.value_or(0.0), center_y.value_or(0.0), radius_x.value_or(0.0), radius_y.value_or(0.0)};
    } else if (*type == "line") {
        reject_unknown_keys(value, path, context, {"x1", "y1", "x2", "y2"});
        const auto x1 = required_number(value, "x1", path, context);
        const auto y1 = required_number(value, "y1", path, context);
        const auto x2 = required_number(value, "x2", path, context);
        const auto y2 = required_number(value, "y2", path, context);
        node.geometry = Line{{x1.value_or(0.0), y1.value_or(0.0)}, {x2.value_or(0.0), y2.value_or(0.0)}};
    } else if (*type == "polygon") {
        reject_unknown_keys(value, path, context, {"points"});
        node.geometry = Polygon{parse_points(value, path, context, 3U)};
    } else if (*type == "polyline") {
        reject_unknown_keys(value, path, context, {"points"});
        node.geometry = Polyline{parse_points(value, path, context, 2U)};
    } else if (*type == "path") {
        reject_unknown_keys(value, path, context, {"d", "fillRule"});
        const auto data = required_string(value, "d", path, context, maximum_path_size);
        auto fill_rule = FillRule::nonzero;
        if (const auto iterator = value.find("fillRule"); iterator != value.end()) {
            if (!iterator->is_string() || (iterator->get<std::string>() != "nonzero" && iterator->get<std::string>() != "evenodd")) {
                context.error("schema.enum", "Expected nonzero or evenodd", member_path(path, "fillRule"));
            } else if (iterator->get<std::string>() == "evenodd") {
                fill_rule = FillRule::evenodd;
            }
        }
        if (data && !flatten_path(*data).valid) {
            context.error("semantic.pathData", "Path data is malformed or unsupported", member_path(path, "d"));
        }
        node.geometry = Path{data.value_or(""), fill_rule};
    } else if (*type == "text") {
        reject_unknown_keys(value, path, context, {"x", "y", "content", "fontSize", "fontFamily", "fontWeight", "textAnchor", "letterSpacing"});
        const auto x = required_number(value, "x", path, context);
        const auto y = required_number(value, "y", path, context);
        const auto content = required_string(value, "content", path, context, 100'000U);
        const auto font_size = optional_number(value, "fontSize", path, context, 0.001, maximum_coordinate).value_or(16.0);
        auto font_family = std::string{"Inter, ui-sans-serif, system-ui, sans-serif"};
        if (const auto iterator = value.find("fontFamily"); iterator != value.end()) {
            if (!iterator->is_string() || iterator->get_ref<const std::string&>().empty() || iterator->get_ref<const std::string&>().size() > 128U) {
                context.error("schema.fontFamily", "Font family must contain 1 to 128 characters", member_path(path, "fontFamily"));
            } else {
                font_family = iterator->get<std::string>();
            }
        }
        auto font_weight = 400;
        if (const auto iterator = value.find("fontWeight"); iterator != value.end()) {
            if (!iterator->is_number_integer()) {
                context.error("schema.type", "Expected an integer font weight", member_path(path, "fontWeight"));
            } else {
                font_weight = iterator->get<int>();
                if (font_weight < 100 || font_weight > 900 || font_weight % 100 != 0) {
                    context.error("schema.range", "Font weight must be a multiple of 100 from 100 to 900", member_path(path, "fontWeight"));
                }
            }
        }
        auto anchor = TextAnchor::start;
        if (const auto iterator = value.find("textAnchor"); iterator != value.end()) {
            if (!iterator->is_string()) {
                context.error("schema.type", "Expected a text anchor", member_path(path, "textAnchor"));
            } else {
                const auto anchor_value = iterator->get<std::string>();
                if (anchor_value == "middle") {
                    anchor = TextAnchor::middle;
                } else if (anchor_value == "end") {
                    anchor = TextAnchor::end;
                } else if (anchor_value != "start") {
                    context.error("schema.enum", "Expected start, middle, or end", member_path(path, "textAnchor"));
                }
            }
        }
        const auto letter_spacing = optional_number(value, "letterSpacing", path, context, -1'000.0, 1'000.0).value_or(0.0);
        node.geometry = Text{x.value_or(0.0), y.value_or(0.0), content.value_or(""), font_size, std::move(font_family), font_weight, anchor, letter_spacing};
    } else if (*type == "group") {
        reject_unknown_keys(value, path, context, {"children"});
        auto group = std::make_shared<Group>();
        const auto iterator = value.find("children");
        const auto children_path = member_path(path, "children");
        if (iterator == value.end()) {
            context.error("schema.required", "Required property is missing", children_path);
        } else if (!iterator->is_array()) {
            context.error("schema.type", "Expected an array of children", children_path);
        } else {
            group->children.reserve(iterator->size());
            for (std::size_t index = 0; index < iterator->size(); ++index) {
                if (auto child = parse_node((*iterator)[index], index_path(children_path, index), context, depth + 1U)) {
                    group->children.push_back(std::move(*child));
                }
            }
        }
        node.geometry = std::move(group);
    } else {
        context.error("schema.type", "Unsupported object type", member_path(path, "type"));
        return std::nullopt;
    }

    return node;
}

void parse_gradients(const Json& array, std::string_view base_path, std::vector<Gradient>& out, ParseContext& context) {
    if (!array.is_array()) {
        context.error("schema.type", "Expected an array of gradients", std::string{base_path});
        return;
    }
    if (array.size() > 1'000U) {
        context.error("limit.gradients", "Gradient count exceeds 1000", std::string{base_path});
        return;
    }

    for (std::size_t index = 0; index < array.size(); ++index) {
        const auto& item = array[index];
        const auto path = index_path(base_path, index);
        if (!item.is_object()) {
            context.error("schema.type", "Expected a gradient object", path);
            continue;
        }
        const auto id = required_string(item, "id", path, context, 128U);
        const auto type = required_string(item, "type", path, context, 32U);
        if (!id || !type) {
            continue;
        }
        if (!is_valid_id(*id)) {
            context.error("schema.id", "Gradient id has an unsupported format", member_path(path, "id"));
        }
        if (!context.gradient_ids.emplace(*id).second) {
            context.error("semantic.duplicateGradientId", "Gradient id must be unique", member_path(path, "id"));
        }

        auto units = GradientUnits::object_bounding_box;
        if (const auto units_it = item.find("gradientUnits"); units_it != item.end()) {
            if (!units_it->is_string() || (units_it->get<std::string>() != "objectBoundingBox" && units_it->get<std::string>() != "userSpaceOnUse")) {
                context.error("schema.enum", "Unsupported gradientUnits value", member_path(path, "gradientUnits"));
            } else if (units_it->get<std::string>() == "userSpaceOnUse") {
                units = GradientUnits::user_space_on_use;
            }
        }

        auto spread = SpreadMethod::pad;
        if (const auto spread_it = item.find("spreadMethod"); spread_it != item.end()) {
            if (!spread_it->is_string()) {
                context.error("schema.type", "Expected string spreadMethod", member_path(path, "spreadMethod"));
            } else {
                const auto& s = spread_it->get_ref<const std::string&>();
                if (s == "reflect") {
                    spread = SpreadMethod::reflect;
                } else if (s == "repeat") {
                    spread = SpreadMethod::repeat;
                } else if (s != "pad") {
                    context.error("schema.enum", "Unsupported spreadMethod value", member_path(path, "spreadMethod"));
                }
            }
        }

        std::vector<GradientStop> stops;
        const auto stops_it = item.find("stops");
        const auto stops_path = member_path(path, "stops");
        if (stops_it == item.end() || !stops_it->is_array() || stops_it->size() < 2U || stops_it->size() > 64U) {
            context.error("schema.stops", "Gradient requires between 2 and 64 stops", stops_path);
        } else {
            stops.reserve(stops_it->size());
            for (std::size_t stop_index = 0; stop_index < stops_it->size(); ++stop_index) {
                const auto& stop_item = (*stops_it)[stop_index];
                const auto stop_path = index_path(stops_path, stop_index);
                if (!stop_item.is_object()) {
                    context.error("schema.type", "Expected a gradient stop object", stop_path);
                    continue;
                }
                const auto offset = required_number(stop_item, "offset", stop_path, context, 0.0, 1.0);
                const auto color_str = required_string(stop_item, "color", stop_path, context, 16U);
                const auto opacity = optional_number(stop_item, "opacity", stop_path, context, 0.0, 1.0).value_or(1.0);
                const auto color = color_str ? parse_color(*color_str) : std::nullopt;
                if (color_str && !color) {
                    context.error("schema.color", "Expected a hexadecimal stop color", member_path(stop_path, "color"));
                }
                if (offset && color) {
                    stops.push_back({*offset, *color, opacity});
                }
            }
            std::ranges::stable_sort(stops, {}, &GradientStop::offset);
        }

        if (*type == "linear") {
            constexpr std::array allowed{"id", "type", "gradientUnits", "spreadMethod", "stops", "x1", "y1", "x2", "y2"};
            for (const auto& [k, v] : item.items()) {
                static_cast<void>(v);
                if (std::ranges::find(allowed, k) == allowed.end()) {
                    context.error("schema.additionalProperties", "Unsupported linear gradient property", member_path(path, k));
                }
            }
            const auto x1 = optional_number(item, "x1", path, context, -maximum_coordinate, maximum_coordinate).value_or(0.0);
            const auto y1 = optional_number(item, "y1", path, context, -maximum_coordinate, maximum_coordinate).value_or(0.0);
            const auto x2 = optional_number(item, "x2", path, context, -maximum_coordinate, maximum_coordinate).value_or(1.0);
            const auto y2 = optional_number(item, "y2", path, context, -maximum_coordinate, maximum_coordinate).value_or(0.0);
            out.push_back(LinearGradient{*id, units, spread, x1, y1, x2, y2, std::move(stops)});
        } else if (*type == "radial") {
            constexpr std::array allowed{"id", "type", "gradientUnits", "spreadMethod", "stops", "cx", "cy", "r", "fx", "fy"};
            for (const auto& [k, v] : item.items()) {
                static_cast<void>(v);
                if (std::ranges::find(allowed, k) == allowed.end()) {
                    context.error("schema.additionalProperties", "Unsupported radial gradient property", member_path(path, k));
                }
            }
            const auto cx = optional_number(item, "cx", path, context, -maximum_coordinate, maximum_coordinate).value_or(0.5);
            const auto cy = optional_number(item, "cy", path, context, -maximum_coordinate, maximum_coordinate).value_or(0.5);
            const auto r = optional_number(item, "r", path, context, 0.0001, maximum_coordinate).value_or(0.5);
            const auto fx = optional_number(item, "fx", path, context, -maximum_coordinate, maximum_coordinate);
            const auto fy = optional_number(item, "fy", path, context, -maximum_coordinate, maximum_coordinate);
            out.push_back(RadialGradient{*id, units, spread, cx, cy, r, fx, fy, std::move(stops)});
        } else {
            context.error("unsupported.gradient", "Unsupported gradient type: " + *type, member_path(path, "type"));
        }
    }
}

void parse_layers(const Json& array, std::vector<Layer>& out, ParseContext& context) {
    constexpr auto base_path = std::string_view{"/layers"};
    if (!array.is_array()) {
        context.error("schema.type", "Expected an array of layers", std::string{base_path});
        return;
    }
    if (array.size() > 1'000U) {
        context.error("limit.layers", "Layer count exceeds 1000", std::string{base_path});
        return;
    }
    out.reserve(array.size());
    for (std::size_t index = 0; index < array.size(); ++index) {
        const auto& item = array[index];
        const auto path = index_path(base_path, index);
        if (!item.is_object()) {
            context.error("schema.type", "Expected a layer object", path);
            continue;
        }
        constexpr std::array allowed{"id", "name", "visible", "opacity", "objects"};
        for (const auto& [k, v] : item.items()) {
            static_cast<void>(v);
            if (std::ranges::find(allowed, k) == allowed.end()) {
                context.error("schema.additionalProperties", "Unsupported layer property", member_path(path, k));
            }
        }
        const auto id = required_string(item, "id", path, context, 128U);
        if (!id) {
            continue;
        }
        if (!is_valid_id(*id)) {
            context.error("schema.id", "Layer id has an unsupported format", member_path(path, "id"));
        }
        if (!context.layer_ids.emplace(*id).second) {
            context.error("semantic.duplicateLayerId", "Layer id must be unique", member_path(path, "id"));
        }
        Layer layer;
        layer.id = *id;
        if (const auto name_it = item.find("name"); name_it != item.end()) {
            if (!name_it->is_string() || name_it->get_ref<const std::string&>().empty() || name_it->get_ref<const std::string&>().size() > 128U) {
                context.error("schema.name", "Layer name must contain 1 to 128 characters", member_path(path, "name"));
            } else {
                layer.name = name_it->get<std::string>();
            }
        }
        if (const auto vis_it = item.find("visible"); vis_it != item.end()) {
            if (!vis_it->is_boolean()) {
                context.error("schema.type", "Expected boolean layer visibility", member_path(path, "visible"));
            } else {
                layer.visible = vis_it->get<bool>();
            }
        }
        layer.opacity = optional_number(item, "opacity", path, context, 0.0, 1.0).value_or(1.0);
        const auto objects_it = item.find("objects");
        const auto objects_path = member_path(path, "objects");
        if (objects_it == item.end() || !objects_it->is_array()) {
            context.error("schema.required", "Layer requires an objects array", objects_path);
        } else {
            layer.objects.reserve(objects_it->size());
            for (std::size_t child_index = 0; child_index < objects_it->size(); ++child_index) {
                if (auto node = parse_node((*objects_it)[child_index], index_path(objects_path, child_index), context, 1U)) {
                    if (!node->layer_id) {
                        node->layer_id = layer.id;
                    }
                    layer.objects.push_back(std::move(*node));
                }
            }
        }
        out.push_back(std::move(layer));
    }
}

[[nodiscard]] auto parse_document(const Json& value, std::vector<Gradient>& scene_gradients, ParseContext& context) -> std::optional<Document> {
    constexpr auto path = std::string_view{"/document"};
    if (!value.is_object()) {
        context.error("schema.type", "Expected a document object", std::string{path});
        return std::nullopt;
    }
    constexpr std::array allowed_keys{
        std::string_view{"width"},
        std::string_view{"height"},
        std::string_view{"unit"},
        std::string_view{"background"},
        std::string_view{"gradients"},
        std::string_view{"workspaces"}
    };
    for (const auto& [key, child] : value.items()) {
        static_cast<void>(child);
        if (std::ranges::find(allowed_keys, key) == allowed_keys.end()) {
            context.error("schema.additionalProperties", "Unsupported document property", member_path(path, key));
        }
    }

    const auto parse_dimension = [&](std::string_view key) -> std::optional<std::uint32_t> {
        const auto iterator = value.find(key);
        const auto target_path = member_path(path, key);
        if (iterator == value.end()) {
            context.error("schema.required", "Required property is missing", target_path);
            return std::nullopt;
        }
        if (!iterator->is_number_unsigned() && !iterator->is_number_integer()) {
            context.error("schema.type", "Expected a positive integer", target_path);
            return std::nullopt;
        }
        if (iterator->is_number_unsigned()) {
            const auto dimension = iterator->get<std::uint64_t>();
            if (dimension < 1U || dimension > maximum_dimension) {
                context.error("limit.dimension", "Dimension must be between 1 and 16384", target_path);
                return std::nullopt;
            }
            return static_cast<std::uint32_t>(dimension);
        }
        const auto dimension = iterator->get<std::int64_t>();
        if (dimension < 1 || dimension > static_cast<std::int64_t>(maximum_dimension)) {
            context.error("limit.dimension", "Dimension must be between 1 and 16384", target_path);
            return std::nullopt;
        }
        return static_cast<std::uint32_t>(dimension);
    };

    const auto width = parse_dimension("width");
    const auto height = parse_dimension("height");
    auto unit = std::string{"px"};
    if (const auto iterator = value.find("unit"); iterator != value.end()) {
        constexpr std::array units{
            std::string_view{"px"}, std::string_view{"pt"}, std::string_view{"mm"},
            std::string_view{"cm"}, std::string_view{"in"}
        };
        if (!iterator->is_string() || std::ranges::find(units, iterator->get<std::string>()) == units.end()) {
            context.error("schema.enum", "Unsupported document unit", member_path(path, "unit"));
        } else {
            unit = iterator->get<std::string>();
        }
    }

    std::optional<Color> background;
    if (const auto iterator = value.find("background"); iterator != value.end()) {
        if (!iterator->is_string()) {
            context.error("schema.type", "Expected a color string", member_path(path, "background"));
        } else if (iterator->get<std::string>() != "none") {
            background = parse_color(iterator->get<std::string>());
            if (!background) {
                context.error("schema.color", "Expected a hexadecimal color", member_path(path, "background"));
            }
        }
    }

    if (const auto grad_it = value.find("gradients"); grad_it != value.end()) {
        parse_gradients(*grad_it, "/document/gradients", scene_gradients, context);
    }

    std::vector<Workspace> workspaces;
    if (const auto ws_it = value.find("workspaces"); ws_it != value.end()) {
        const auto ws_base = member_path(path, "workspaces");
        if (!ws_it->is_array() || ws_it->size() > 256U) {
            context.error("schema.workspaces", "Expected at most 256 workspace entries", ws_base);
        } else {
            std::unordered_set<std::string> ws_ids;
            for (std::size_t index = 0; index < ws_it->size(); ++index) {
                const auto& item = (*ws_it)[index];
                const auto ws_path = index_path(ws_base, index);
                if (!item.is_object()) {
                    context.error("schema.type", "Expected a workspace object", ws_path);
                    continue;
                }
                constexpr std::array ws_allowed{"id", "name", "x", "y", "width", "height"};
                for (const auto& [k, v] : item.items()) {
                    static_cast<void>(v);
                    if (std::ranges::find(ws_allowed, k) == ws_allowed.end()) {
                        context.error("schema.additionalProperties", "Unsupported workspace property", member_path(ws_path, k));
                    }
                }
                const auto id = required_string(item, "id", ws_path, context, 128U);
                const auto x = required_number(item, "x", ws_path, context);
                const auto y = required_number(item, "y", ws_path, context);
                const auto ws_w = required_number(item, "width", ws_path, context, 0.001, maximum_coordinate);
                const auto ws_h = required_number(item, "height", ws_path, context, 0.001, maximum_coordinate);
                if (id && !is_valid_id(*id)) {
                    context.error("schema.id", "Workspace id has an unsupported format", member_path(ws_path, "id"));
                }
                if (id && !ws_ids.emplace(*id).second) {
                    context.error("semantic.duplicateWorkspaceId", "Workspace id must be unique", member_path(ws_path, "id"));
                }
                auto name = id.value_or("");
                if (const auto name_it = item.find("name"); name_it != item.end() && name_it->is_string()) {
                    name = name_it->get<std::string>();
                }
                if (id && x && y && ws_w && ws_h) {
                    workspaces.push_back({*id, std::move(name), *x, *y, *ws_w, *ws_h});
                }
            }
        }
    }

    if (!width || !height) {
        return std::nullopt;
    }
    const auto pixels = static_cast<std::uint64_t>(*width) * static_cast<std::uint64_t>(*height);
    if (pixels > maximum_pixels) {
        context.error("limit.documentPixels", "Document area exceeds 67108864 pixels", std::string{path});
    } else if (pixels > 16'777'216ULL) {
        context.warning("performance.largeDocument", "Large documents may take longer to rasterize", std::string{path});
    }
    return Document{*width, *height, std::move(unit), background, std::move(workspaces)};
}

[[nodiscard]] auto hex_value(char character) -> std::optional<std::uint8_t> {
    if (character >= '0' && character <= '9') {
        return static_cast<std::uint8_t>(character - '0');
    }
    if (character >= 'a' && character <= 'f') {
        return static_cast<std::uint8_t>(character - 'a' + 10);
    }
    if (character >= 'A' && character <= 'F') {
        return static_cast<std::uint8_t>(character - 'A' + 10);
    }
    return std::nullopt;
}

[[nodiscard]] auto hex_pair(char high, char low) -> std::optional<std::uint8_t> {
    const auto high_value = hex_value(high);
    const auto low_value = hex_value(low);
    if (!high_value || !low_value) {
        return std::nullopt;
    }
    return static_cast<std::uint8_t>(*high_value * 16U + *low_value);
}

}

auto parse_color(std::string_view value) -> std::optional<Color> {
    if (value.empty() || value.front() != '#') {
        return std::nullopt;
    }
    const auto hex = value.substr(1);
    if (hex.size() == 3U || hex.size() == 4U) {
        const auto red = hex_value(hex[0]);
        const auto green = hex_value(hex[1]);
        const auto blue = hex_value(hex[2]);
        const auto alpha = hex.size() == 4U ? hex_value(hex[3]) : std::optional<std::uint8_t>{15U};
        if (!red || !green || !blue || !alpha) {
            return std::nullopt;
        }
        return Color{
            static_cast<std::uint8_t>(*red * 17U),
            static_cast<std::uint8_t>(*green * 17U),
            static_cast<std::uint8_t>(*blue * 17U),
            static_cast<std::uint8_t>(*alpha * 17U)
        };
    }
    if (hex.size() == 6U || hex.size() == 8U) {
        const auto red = hex_pair(hex[0], hex[1]);
        const auto green = hex_pair(hex[2], hex[3]);
        const auto blue = hex_pair(hex[4], hex[5]);
        const auto alpha = hex.size() == 8U ? hex_pair(hex[6], hex[7]) : std::optional<std::uint8_t>{255U};
        if (!red || !green || !blue || !alpha) {
            return std::nullopt;
        }
        return Color{*red, *green, *blue, *alpha};
    }
    return std::nullopt;
}

auto parse_scene(std::string_view source) -> ValidationResult {
    ParseContext context;
    if (source.size() > maximum_source_size) {
        context.error("limit.sourceSize", "JSON input exceeds 4 MB", "$");
        return {std::nullopt, std::move(context.issues)};
    }

    const auto root = Json::parse(source.begin(), source.end(), nullptr, false, false);
    if (root.is_discarded()) {
        context.error("json.parse", "Malformed JSON input", "$");
        return {std::nullopt, std::move(context.issues)};
    }
    if (!root.is_object()) {
        context.error("schema.type", "Root value must be an object", "$");
        return {std::nullopt, std::move(context.issues)};
    }

    constexpr std::array root_keys{
        std::string_view{"version"},
        std::string_view{"document"},
        std::string_view{"gradients"},
        std::string_view{"layers"},
        std::string_view{"objects"}
    };
    for (const auto& [key, value] : root.items()) {
        static_cast<void>(value);
        if (std::ranges::find(root_keys, key) == root_keys.end()) {
            context.error("schema.additionalProperties", "Unsupported root property", member_path("", key));
        }
    }

    auto scene = Scene{};
    if (const auto iterator = root.find("version"); iterator == root.end()) {
        context.error("schema.required", "Required property is missing", "/version");
    } else if (!iterator->is_string() || iterator->get<std::string>() != "1.0") {
        context.error("schema.version", "Only scene version 1.0 is supported", "/version");
    }

    if (const auto grad_it = root.find("gradients"); grad_it != root.end()) {
        parse_gradients(*grad_it, "/gradients", scene.gradients, context);
    }

    if (const auto iterator = root.find("document"); iterator == root.end()) {
        context.error("schema.required", "Required property is missing", "/document");
    } else if (auto document = parse_document(*iterator, scene.gradients, context)) {
        scene.document = std::move(*document);
    }

    if (const auto layers_it = root.find("layers"); layers_it != root.end()) {
        parse_layers(*layers_it, scene.layers, context);
    }

    if (const auto iterator = root.find("objects"); iterator == root.end()) {
        context.error("schema.required", "Required property is missing", "/objects");
    } else if (!iterator->is_array()) {
        context.error("schema.type", "Expected an array of objects", "/objects");
    } else {
        scene.objects.reserve(iterator->size());
        for (std::size_t index = 0; index < iterator->size(); ++index) {
            if (auto node = parse_node((*iterator)[index], index_path("/objects", index), context, 1U)) {
                scene.objects.push_back(std::move(*node));
            }
        }
    }

    for (const auto& [grad_id, ref_path] : context.referenced_gradients) {
        if (!context.gradient_ids.contains(grad_id)) {
            context.error("semantic.missingGradient", "Referenced gradient does not exist: " + grad_id, ref_path);
        }
    }

    auto result = ValidationResult{std::nullopt, std::move(context.issues)};
    const auto has_errors = std::ranges::any_of(result.issues, [](const Issue& issue) {
        return issue.severity == Severity::error;
    });
    if (!has_errors) {
        result.scene = std::move(scene);
    }
    return result;
}

}
