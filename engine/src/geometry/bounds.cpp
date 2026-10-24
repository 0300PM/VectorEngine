#include "vector_engine/bounds.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <ranges>
#include <string>
#include <type_traits>
#include <unordered_set>
#include <utility>

#include "vector_engine/path.hpp"

namespace vector_engine {

namespace {

constexpr auto pi = 3.141592653589793238462643383279502884;
constexpr std::uint32_t maximum_dimension = 16'384U;
constexpr std::uint64_t maximum_pixels = 67'108'864ULL;
constexpr std::uint64_t soft_memory_warning_bytes = 64ULL * 1024ULL * 1024ULL;

struct BoxAccumulator {
    double min_x{std::numeric_limits<double>::infinity()};
    double min_y{std::numeric_limits<double>::infinity()};
    double max_x{-std::numeric_limits<double>::infinity()};
    double max_y{-std::numeric_limits<double>::infinity()};

    void include(Point point) {
        min_x = std::min(min_x, point.x);
        min_y = std::min(min_y, point.y);
        max_x = std::max(max_x, point.x);
        max_y = std::max(max_y, point.y);
    }

    void include_box(const BoundingBox& box) {
        min_x = std::min(min_x, box.min_x);
        min_y = std::min(min_y, box.min_y);
        max_x = std::max(max_x, box.max_x);
        max_y = std::max(max_y, box.max_y);
    }

    [[nodiscard]] auto finish(double pad = 0.0) const -> std::optional<BoundingBox> {
        if (!std::isfinite(min_x) || !std::isfinite(min_y) || !std::isfinite(max_x) || !std::isfinite(max_y)) {
            return std::nullopt;
        }
        return BoundingBox{min_x - pad, min_y - pad, max_x + pad, max_y + pad};
    }
};

[[nodiscard]] auto matrix_stroke_scale(const Matrix& matrix) -> double {
    return (std::hypot(matrix.a, matrix.b) + std::hypot(matrix.c, matrix.d)) * 0.5;
}

[[nodiscard]] auto has_stroke_paint(const Style& style) -> bool {
    return (style.stroke.has_value() || style.stroke_gradient_id.has_value()) && style.stroke_width > 0.0;
}

[[nodiscard]] auto stroke_padding(const Style& style, const Matrix& matrix) -> double {
    return has_stroke_paint(style) ? style.stroke_width * matrix_stroke_scale(matrix) * 0.5 : 0.0;
}

[[nodiscard]] auto ellipse_world_bounds(
    double center_x,
    double center_y,
    double radius_x,
    double radius_y,
    const Matrix& matrix,
    double pad
) -> BoundingBox {
    const auto center = matrix.apply({center_x, center_y});
    const auto extent_x = std::hypot(matrix.a * radius_x, matrix.c * radius_y);
    const auto extent_y = std::hypot(matrix.b * radius_x, matrix.d * radius_y);
    return {
        center.x - extent_x - pad,
        center.y - extent_y - pad,
        center.x + extent_x + pad,
        center.y + extent_y + pad
    };
}

[[nodiscard]] auto rect_world_bounds(const Rectangle& rect, const Matrix& matrix, double pad) -> BoundingBox {
    BoxAccumulator accumulator;
    const auto rx = std::min(std::max(0.0, rect.radius_x), rect.width * 0.5);
    const auto ry = std::min(std::max(0.0, rect.radius_y), rect.height * 0.5);
    if (rx <= 0.0 || ry <= 0.0) {
        accumulator.include(matrix.apply({rect.x, rect.y}));
        accumulator.include(matrix.apply({rect.x + rect.width, rect.y}));
        accumulator.include(matrix.apply({rect.x + rect.width, rect.y + rect.height}));
        accumulator.include(matrix.apply({rect.x, rect.y + rect.height}));
    } else {
        const std::array centers{
            Point{rect.x + rect.width - rx, rect.y + ry},
            Point{rect.x + rect.width - rx, rect.y + rect.height - ry},
            Point{rect.x + rx, rect.y + rect.height - ry},
            Point{rect.x + rx, rect.y + ry}
        };
        for (std::size_t corner = 0; corner < centers.size(); ++corner) {
            const auto start_angle = -pi * 0.5 + static_cast<double>(corner) * pi * 0.5;
            for (int step = 0; step <= 8; ++step) {
                const auto angle = start_angle + static_cast<double>(step) / 8.0 * pi * 0.5;
                accumulator.include(matrix.apply({
                    centers[corner].x + std::cos(angle) * rx,
                    centers[corner].y + std::sin(angle) * ry
                }));
            }
        }
    }
    return accumulator.finish(pad).value_or(BoundingBox{});
}

[[nodiscard]] auto text_world_bounds(const Text& text, const Matrix& matrix, double pad) -> BoundingBox {
    const auto glyph_advance = text.font_size * 0.6 + text.letter_spacing;
    const auto width = std::max(text.font_size * 0.5, static_cast<double>(text.content.size()) * std::max(1.0, glyph_advance));
    auto origin_x = text.x;
    if (text.anchor == TextAnchor::middle) {
        origin_x -= width * 0.5;
    } else if (text.anchor == TextAnchor::end) {
        origin_x -= width;
    }
    const auto top = text.y - text.font_size * 0.9;
    const auto bottom = text.y + text.font_size * 0.25;
    BoxAccumulator accumulator;
    accumulator.include(matrix.apply({origin_x, top}));
    accumulator.include(matrix.apply({origin_x + width, top}));
    accumulator.include(matrix.apply({origin_x + width, bottom}));
    accumulator.include(matrix.apply({origin_x, bottom}));
    return accumulator.finish(pad).value_or(BoundingBox{});
}

[[nodiscard]] auto clone_node_visibility(const Node& node, bool force_visible) -> Node {
    Node copy = node;
    if (force_visible) {
        copy.style.visible = true;
    }
    if (const auto* group_ptr = std::get_if<std::shared_ptr<Group>>(&node.geometry); group_ptr && *group_ptr) {
        auto cloned_group = std::make_shared<Group>();
        cloned_group->children.reserve((*group_ptr)->children.size());
        for (const auto& child : (*group_ptr)->children) {
            if (!force_visible && !child.style.visible) {
                continue;
            }
            cloned_group->children.push_back(clone_node_visibility(child, force_visible));
        }
        copy.geometry = std::move(cloned_group);
    }
    return copy;
}

void collect_ids(const Node& node, std::unordered_set<std::string>& ids, std::unordered_set<std::string>& group_ids) {
    ids.insert(node.id);
    if (const auto* group = std::get_if<std::shared_ptr<Group>>(&node.geometry); group && *group) {
        group_ids.insert(node.id);
        for (const auto& child : (*group)->children) {
            collect_ids(child, ids, group_ids);
        }
    }
}

[[nodiscard]] auto filter_node_by_ids(
    const Node& node,
    const std::unordered_set<std::string>& selected_ids,
    bool include_hidden
) -> std::optional<Node> {
    if (!include_hidden && !node.style.visible) {
        return std::nullopt;
    }
    if (selected_ids.contains(node.id)) {
        return clone_node_visibility(node, include_hidden);
    }
    if (const auto* group = std::get_if<std::shared_ptr<Group>>(&node.geometry); group && *group) {
        auto pruned_group = std::make_shared<Group>();
        for (const auto& child : (*group)->children) {
            if (auto kept = filter_node_by_ids(child, selected_ids, include_hidden)) {
                pruned_group->children.push_back(std::move(*kept));
            }
        }
        if (!pruned_group->children.empty()) {
            Node container = node;
            container.style.visible = true;
            container.geometry = std::move(pruned_group);
            return container;
        }
    }
    return std::nullopt;
}

[[nodiscard]] auto filter_node_by_layer(
    const Node& node,
    std::string_view layer_id,
    bool include_hidden
) -> std::optional<Node> {
    if (!include_hidden && !node.style.visible) {
        return std::nullopt;
    }
    if (node.layer_id && *node.layer_id == layer_id) {
        return clone_node_visibility(node, include_hidden);
    }
    if (const auto* group = std::get_if<std::shared_ptr<Group>>(&node.geometry); group && *group) {
        auto pruned_group = std::make_shared<Group>();
        for (const auto& child : (*group)->children) {
            if (auto kept = filter_node_by_layer(child, layer_id, include_hidden)) {
                pruned_group->children.push_back(std::move(*kept));
            }
        }
        if (!pruned_group->children.empty()) {
            Node container = node;
            container.style.visible = true;
            container.geometry = std::move(pruned_group);
            return container;
        }
    }
    return std::nullopt;
}

[[nodiscard]] auto has_layer_reference(const Node& node, std::string_view layer_id) -> bool {
    if (node.layer_id && *node.layer_id == layer_id) {
        return true;
    }
    if (const auto* group = std::get_if<std::shared_ptr<Group>>(&node.geometry); group && *group) {
        return std::ranges::any_of((*group)->children, [&](const Node& child) {
            return has_layer_reference(child, layer_id);
        });
    }
    return false;
}

}

auto compute_node_bounds(const Node& node, const Matrix& parent, bool include_hidden) -> std::optional<BoundingBox> {
    if (!include_hidden && !node.style.visible) {
        return std::nullopt;
    }
    const auto matrix = parent * node.transform;
    const auto pad = stroke_padding(node.style, matrix);

    return std::visit([&](const auto& geometry) -> std::optional<BoundingBox> {
        using Type = std::decay_t<decltype(geometry)>;
        if constexpr (std::is_same_v<Type, Rectangle>) {
            return rect_world_bounds(geometry, matrix, pad);
        } else if constexpr (std::is_same_v<Type, Circle>) {
            return ellipse_world_bounds(geometry.center_x, geometry.center_y, geometry.radius, geometry.radius, matrix, pad);
        } else if constexpr (std::is_same_v<Type, Ellipse>) {
            return ellipse_world_bounds(geometry.center_x, geometry.center_y, geometry.radius_x, geometry.radius_y, matrix, pad);
        } else if constexpr (std::is_same_v<Type, Line>) {
            BoxAccumulator accumulator;
            accumulator.include(matrix.apply(geometry.start));
            accumulator.include(matrix.apply(geometry.end));
            return accumulator.finish(pad);
        } else if constexpr (std::is_same_v<Type, Polygon> || std::is_same_v<Type, Polyline>) {
            BoxAccumulator accumulator;
            for (const auto point : geometry.points) {
                accumulator.include(matrix.apply(point));
            }
            return accumulator.finish(pad);
        } else if constexpr (std::is_same_v<Type, Path>) {
            const auto flattened = flatten_path(geometry.data);
            BoxAccumulator accumulator;
            for (const auto& subpath : flattened.subpaths) {
                for (const auto point : subpath.points) {
                    accumulator.include(matrix.apply(point));
                }
            }
            return accumulator.finish(pad);
        } else if constexpr (std::is_same_v<Type, Text>) {
            return text_world_bounds(geometry, matrix, pad);
        } else if constexpr (std::is_same_v<Type, std::shared_ptr<Group>>) {
            if (!geometry) {
                return std::nullopt;
            }
            BoxAccumulator accumulator;
            for (const auto& child : geometry->children) {
                if (const auto child_bounds = compute_node_bounds(child, matrix, include_hidden)) {
                    accumulator.include_box(*child_bounds);
                }
            }
            return accumulator.finish();
        }
    }, node.geometry);
}

auto compute_scene_bounds(const Scene& scene, bool include_hidden) -> std::optional<BoundingBox> {
    BoxAccumulator accumulator;
    for (const auto& layer : scene.layers) {
        if (!include_hidden && !layer.visible) {
            continue;
        }
        for (const auto& object : layer.objects) {
            if (const auto box = compute_node_bounds(object, Matrix::identity(), include_hidden)) {
                accumulator.include_box(*box);
            }
        }
    }
    for (const auto& object : scene.objects) {
        if (const auto box = compute_node_bounds(object, Matrix::identity(), include_hidden)) {
            accumulator.include_box(*box);
        }
    }
    return accumulator.finish();
}

auto prepare_scoped_scene(
    const Scene& source,
    const ExportTarget& target,
    bool include_hidden,
    std::vector<Issue>& issues
) -> std::optional<Scene> {
    Scene scoped;
    scoped.version = source.version;
    scoped.document = source.document;
    scoped.gradients = source.gradients;

    std::unordered_set<std::string> all_ids;
    std::unordered_set<std::string> group_ids;
    for (const auto& layer : source.layers) {
        for (const auto& object : layer.objects) {
            collect_ids(object, all_ids, group_ids);
        }
    }
    for (const auto& object : source.objects) {
        collect_ids(object, all_ids, group_ids);
    }

    if (target.kind == TargetKind::scene || target.kind == TargetKind::workspace) {
        if (target.kind == TargetKind::workspace && !target.region && !target.id.empty()) {
            const auto match = std::ranges::find(source.document.workspaces, target.id, &Workspace::id);
            if (match == source.document.workspaces.end()) {
                issues.push_back({"target.notFound", "Workspace was not found in document", "/target/id", Severity::error});
                return std::nullopt;
            }
        }
        if (target.kind == TargetKind::workspace && target.region) {
            if (target.region->width() <= 0.0 || target.region->height() <= 0.0) {
                issues.push_back({"target.invalidRegion", "Workspace region must have positive width and height", "/target/region", Severity::error});
                return std::nullopt;
            }
        }
        for (const auto& layer : source.layers) {
            if (!include_hidden && !layer.visible) {
                continue;
            }
            Layer cloned_layer{layer.id, layer.name, true, layer.opacity, {}};
            for (const auto& object : layer.objects) {
                if (!include_hidden && !object.style.visible) {
                    continue;
                }
                cloned_layer.objects.push_back(clone_node_visibility(object, include_hidden));
            }
            scoped.layers.push_back(std::move(cloned_layer));
        }
        for (const auto& object : source.objects) {
            if (!include_hidden && !object.style.visible) {
                continue;
            }
            scoped.objects.push_back(clone_node_visibility(object, include_hidden));
        }
        return scoped;
    }

    if (target.kind == TargetKind::layer) {
        if (target.id.empty()) {
            issues.push_back({"target.invalid", "Layer identifier is required", "/target/layerId", Severity::error});
            return std::nullopt;
        }
        bool layer_found = false;
        for (const auto& layer : source.layers) {
            if (layer.id == target.id) {
                layer_found = true;
                if (include_hidden || layer.visible) {
                    Layer cloned_layer{layer.id, layer.name, true, layer.opacity, {}};
                    for (const auto& object : layer.objects) {
                        if (!include_hidden && !object.style.visible) {
                            continue;
                        }
                        cloned_layer.objects.push_back(clone_node_visibility(object, include_hidden));
                    }
                    scoped.layers.push_back(std::move(cloned_layer));
                }
            } else if (include_hidden || layer.visible) {
                Layer partial_layer{layer.id, layer.name, true, layer.opacity, {}};
                for (const auto& object : layer.objects) {
                    if (has_layer_reference(object, target.id)) {
                        layer_found = true;
                    }
                    if (auto kept = filter_node_by_layer(object, target.id, include_hidden)) {
                        partial_layer.objects.push_back(std::move(*kept));
                    }
                }
                if (!partial_layer.objects.empty()) {
                    scoped.layers.push_back(std::move(partial_layer));
                }
            }
        }
        for (const auto& object : source.objects) {
            if (has_layer_reference(object, target.id)) {
                layer_found = true;
            }
            if (auto kept = filter_node_by_layer(object, target.id, include_hidden)) {
                scoped.objects.push_back(std::move(*kept));
            }
        }
        if (!layer_found) {
            issues.push_back({"target.notFound", "Layer was not found in scene", "/target/layerId", Severity::error});
            return std::nullopt;
        }
        return scoped;
    }

    std::unordered_set<std::string> selected_ids;
    if (target.kind == TargetKind::group) {
        if (target.id.empty() || !all_ids.contains(target.id)) {
            issues.push_back({"target.notFound", "Group was not found in scene", "/target/objectId", Severity::error});
            return std::nullopt;
        }
        if (!group_ids.contains(target.id)) {
            issues.push_back({"target.typeMismatch", "Target object is not a group", "/target/objectId", Severity::error});
            return std::nullopt;
        }
        selected_ids.insert(target.id);
    } else if (target.kind == TargetKind::object) {
        if (target.id.empty() || !all_ids.contains(target.id)) {
            issues.push_back({"target.notFound", "Object was not found in scene", "/target/objectId", Severity::error});
            return std::nullopt;
        }
        selected_ids.insert(target.id);
    } else {
        if (target.ids.empty()) {
            issues.push_back({"target.emptySelection", "At least one object identifier is required", "/target/objectIds", Severity::error});
            return std::nullopt;
        }
        for (const auto& candidate : target.ids) {
            if (!all_ids.contains(candidate)) {
                issues.push_back({"target.notFound", "Selected object was not found in scene: " + candidate, "/target/objectIds", Severity::error});
                return std::nullopt;
            }
            selected_ids.insert(candidate);
        }
    }

    for (const auto& layer : source.layers) {
        if (!include_hidden && !layer.visible) {
            continue;
        }
        Layer partial{layer.id, layer.name, true, layer.opacity, {}};
        for (const auto& object : layer.objects) {
            if (auto kept = filter_node_by_ids(object, selected_ids, include_hidden)) {
                partial.objects.push_back(std::move(*kept));
            }
        }
        if (!partial.objects.empty()) {
            scoped.layers.push_back(std::move(partial));
        }
    }
    for (const auto& object : source.objects) {
        if (auto kept = filter_node_by_ids(object, selected_ids, include_hidden)) {
            scoped.objects.push_back(std::move(*kept));
        }
    }
    return scoped;
}

auto resolve_viewport(
    const Scene& original_scene,
    const Scene& scoped_scene,
    const RenderOptions& options,
    std::uint64_t max_memory_bytes,
    std::vector<Issue>& issues
) -> std::optional<Viewport> {
    if (!std::isfinite(options.margin) || options.margin < 0.0 || options.margin > 4'096.0) {
        issues.push_back({"output.margin", "Export margin must be between 0 and 4096", "/output/margin", Severity::error});
        return std::nullopt;
    }
    if (!std::isfinite(options.scale) || options.scale <= 0.0 || options.scale > 64.0) {
        issues.push_back({"output.scale", "Export scale must be positive and at most 64", "/output/scale", Severity::error});
        return std::nullopt;
    }

    BoundingBox source_box{0.0, 0.0, static_cast<double>(original_scene.document.width), static_cast<double>(original_scene.document.height)};
    if (options.target.kind == TargetKind::workspace) {
        if (options.target.region) {
            source_box = *options.target.region;
        } else if (!options.target.id.empty()) {
            const auto match = std::ranges::find(original_scene.document.workspaces, options.target.id, &Workspace::id);
            if (match != original_scene.document.workspaces.end()) {
                source_box = {match->x, match->y, match->x + match->width, match->y + match->height};
            }
        }
    }

    if (options.trim_to_bounds) {
        const auto measured = compute_scene_bounds(scoped_scene, true);
        if (measured && measured->width() > 0.0 && measured->height() > 0.0) {
            if (options.target.kind == TargetKind::workspace) {
                const auto min_x = std::max(source_box.min_x, measured->min_x);
                const auto min_y = std::max(source_box.min_y, measured->min_y);
                const auto max_x = std::min(source_box.max_x, measured->max_x);
                const auto max_y = std::min(source_box.max_y, measured->max_y);
                if (max_x > min_x && max_y > min_y) {
                    source_box = {min_x, min_y, max_x, max_y};
                }
            } else {
                source_box = *measured;
            }
        } else {
            issues.push_back({"bounds.empty", "Target scope contains no visible geometry; falling back to base bounds", "/target", Severity::warning});
        }
    }

    if (source_box.width() <= 0.0) {
        source_box.max_x = source_box.min_x + 1.0;
    }
    if (source_box.height() <= 0.0) {
        source_box.max_y = source_box.min_y + 1.0;
    }

    const BoundingBox view_box{
        source_box.min_x - options.margin,
        source_box.min_y - options.margin,
        source_box.max_x + options.margin,
        source_box.max_y + options.margin
    };

    const auto default_width = static_cast<std::uint64_t>(std::llround(std::max(1.0, view_box.width() * options.scale)));
    const auto default_height = static_cast<std::uint64_t>(std::llround(std::max(1.0, view_box.height() * options.scale)));
    const auto width_64 = options.width == 0U ? default_width : static_cast<std::uint64_t>(options.width);
    const auto height_64 = options.height == 0U ? default_height : static_cast<std::uint64_t>(options.height);

    if (width_64 == 0ULL || height_64 == 0ULL || width_64 > maximum_dimension || height_64 > maximum_dimension) {
        issues.push_back({"output.dimensions", "Output dimensions must be between 1 and 16384 pixels", "/output", Severity::error});
        return std::nullopt;
    }

    const auto pixels = width_64 * height_64;
    if (pixels > maximum_pixels) {
        issues.push_back({"output.pixels", "Output cannot exceed 67108864 pixels", "/output", Severity::error});
        return std::nullopt;
    }

    const auto estimated_bytes = pixels * 8ULL;
    if (max_memory_bytes > 0ULL && estimated_bytes > max_memory_bytes) {
        issues.push_back({"limit.memory", "Requested export exceeds the configured memory budget", "/output", Severity::error});
        return std::nullopt;
    }
    if (estimated_bytes > soft_memory_warning_bytes) {
        issues.push_back({"memory.highUsage", "High memory allocation required for rasterizing large export dimensions", "/output", Severity::warning});
    }

    const auto width = static_cast<std::uint32_t>(width_64);
    const auto height = static_cast<std::uint32_t>(height_64);
    const auto vw = view_box.width();
    const auto vh = view_box.height();
    const auto out_w = static_cast<double>(width);
    const auto out_h = static_cast<double>(height);

    Matrix world_to_device = Matrix::identity();
    if (options.fit_mode == FitMode::stretch) {
        const auto scale_x = out_w / vw;
        const auto scale_y = out_h / vh;
        world_to_device = Matrix::translation(-view_box.min_x * scale_x, -view_box.min_y * scale_y) *
            Matrix::scaling(scale_x, scale_y);
    } else {
        const auto uniform = options.fit_mode == FitMode::cover
            ? std::max(out_w / vw, out_h / vh)
            : std::min(out_w / vw, out_h / vh);
        const auto offset_x = (out_w - vw * uniform) * 0.5 - view_box.min_x * uniform;
        const auto offset_y = (out_h - vh * uniform) * 0.5 - view_box.min_y * uniform;
        world_to_device = Matrix::translation(offset_x, offset_y) * Matrix::scaling(uniform, uniform);
    }

    return Viewport{
        source_box,
        view_box,
        width,
        height,
        options.fit_mode,
        options.clip_to_bounds,
        world_to_device
    };
}

}
