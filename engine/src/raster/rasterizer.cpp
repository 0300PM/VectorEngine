#include "vector_engine/rasterizer.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <ranges>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

#include <stb_easy_font.h>

#include "vector_engine/path.hpp"

namespace vector_engine {

namespace {

constexpr auto pi = 3.141592653589793238462643383279502884;
constexpr std::uint64_t maximum_pixels = 67'108'864ULL;
constexpr std::array sample_offsets{0.25, 0.75};

struct RasterSurface {
    PixelBuffer buffer;

    void blend(int x, int y, Color color, double opacity, double coverage) {
        if (x < 0 || y < 0 || x >= static_cast<int>(buffer.width) || y >= static_cast<int>(buffer.height)) {
            return;
        }
        const auto source_alpha = std::clamp(
            static_cast<double>(color.alpha) / 255.0 * opacity * coverage,
            0.0,
            1.0
        );
        if (source_alpha <= 0.0) {
            return;
        }
        const auto index = (static_cast<std::size_t>(y) * buffer.width + static_cast<std::size_t>(x)) * 4U;
        const auto destination_alpha = static_cast<double>(buffer.pixels[index + 3U]) / 255.0;
        const auto output_alpha = source_alpha + destination_alpha * (1.0 - source_alpha);
        const auto blend_channel = [&](std::uint8_t source, std::uint8_t destination) {
            if (output_alpha <= 0.0) {
                return std::uint8_t{};
            }
            const auto value = (static_cast<double>(source) * source_alpha +
                static_cast<double>(destination) * destination_alpha * (1.0 - source_alpha)) / output_alpha;
            return static_cast<std::uint8_t>(std::clamp(std::lround(value), 0L, 255L));
        };
        buffer.pixels[index] = blend_channel(color.red, buffer.pixels[index]);
        buffer.pixels[index + 1U] = blend_channel(color.green, buffer.pixels[index + 1U]);
        buffer.pixels[index + 2U] = blend_channel(color.blue, buffer.pixels[index + 2U]);
        buffer.pixels[index + 3U] = static_cast<std::uint8_t>(std::clamp(std::lround(output_alpha * 255.0), 0L, 255L));
    }
};

struct Crossing {
    double x{};
    int winding{};
};

[[nodiscard]] auto transformed_points(const std::vector<Point>& points, const Matrix& matrix) -> std::vector<Point> {
    std::vector<Point> result;
    result.reserve(points.size());
    for (const auto point : points) {
        result.push_back(matrix.apply(point));
    }
    return result;
}

[[nodiscard]] auto rectangle_points(const Rectangle& rectangle) -> std::vector<Point> {
    const auto radius_x = std::min(std::max(0.0, rectangle.radius_x), rectangle.width * 0.5);
    const auto radius_y = std::min(std::max(0.0, rectangle.radius_y), rectangle.height * 0.5);
    if (radius_x <= 0.0 || radius_y <= 0.0) {
        return {
            {rectangle.x, rectangle.y},
            {rectangle.x + rectangle.width, rectangle.y},
            {rectangle.x + rectangle.width, rectangle.y + rectangle.height},
            {rectangle.x, rectangle.y + rectangle.height}
        };
    }

    std::vector<Point> points;
    points.reserve(32U);
    const std::array centers{
        Point{rectangle.x + rectangle.width - radius_x, rectangle.y + radius_y},
        Point{rectangle.x + rectangle.width - radius_x, rectangle.y + rectangle.height - radius_y},
        Point{rectangle.x + radius_x, rectangle.y + rectangle.height - radius_y},
        Point{rectangle.x + radius_x, rectangle.y + radius_y}
    };
    for (std::size_t corner = 0; corner < centers.size(); ++corner) {
        const auto start_angle = -pi * 0.5 + static_cast<double>(corner) * pi * 0.5;
        for (int step = 0; step < 8; ++step) {
            const auto angle = start_angle + static_cast<double>(step) / 7.0 * pi * 0.5;
            points.push_back({
                centers[corner].x + std::cos(angle) * radius_x,
                centers[corner].y + std::sin(angle) * radius_y
            });
        }
    }
    return points;
}

[[nodiscard]] auto ellipse_points(double center_x, double center_y, double radius_x, double radius_y) -> std::vector<Point> {
    const auto circumference = 2.0 * pi * std::sqrt((radius_x * radius_x + radius_y * radius_y) * 0.5);
    const auto segments = std::clamp(static_cast<int>(std::ceil(circumference / 5.0)), 24, 256);
    std::vector<Point> points;
    points.reserve(static_cast<std::size_t>(segments));
    for (int index = 0; index < segments; ++index) {
        const auto angle = 2.0 * pi * static_cast<double>(index) / segments;
        points.push_back({center_x + std::cos(angle) * radius_x, center_y + std::sin(angle) * radius_y});
    }
    return points;
}

[[nodiscard]] auto bounds_of_paths(const std::vector<std::vector<Point>>& paths) -> std::array<double, 4> {
    auto minimum_x = std::numeric_limits<double>::infinity();
    auto minimum_y = std::numeric_limits<double>::infinity();
    auto maximum_x = -std::numeric_limits<double>::infinity();
    auto maximum_y = -std::numeric_limits<double>::infinity();
    for (const auto& path : paths) {
        for (const auto point : path) {
            minimum_x = std::min(minimum_x, point.x);
            minimum_y = std::min(minimum_y, point.y);
            maximum_x = std::max(maximum_x, point.x);
            maximum_y = std::max(maximum_y, point.y);
        }
    }
    return {minimum_x, minimum_y, maximum_x, maximum_y};
}

void add_interval_coverage(
    std::vector<std::uint8_t>& coverage,
    int minimum_x,
    double start,
    double end
) {
    if (end < start) {
        std::swap(start, end);
    }
    const auto first_pixel = static_cast<int>(std::floor(start - 0.75));
    const auto last_pixel = static_cast<int>(std::floor(end - 0.25));
    for (auto x = first_pixel; x <= last_pixel; ++x) {
        const auto index = x - minimum_x;
        if (index < 0 || index >= static_cast<int>(coverage.size())) {
            continue;
        }
        for (const auto offset : sample_offsets) {
            const auto sample_x = static_cast<double>(x) + offset;
            if (sample_x >= start && sample_x < end) {
                coverage[static_cast<std::size_t>(index)] += 1U;
            }
        }
    }
}

void fill_paths(
    RasterSurface& surface,
    const std::vector<std::vector<Point>>& paths,
    Color color,
    double opacity,
    FillRule rule
) {
    if (paths.empty()) {
        return;
    }
    const auto bounds = bounds_of_paths(paths);
    if (!std::isfinite(bounds[0])) {
        return;
    }
    const auto minimum_x = std::max(0, static_cast<int>(std::floor(bounds[0])) - 1);
    const auto minimum_y = std::max(0, static_cast<int>(std::floor(bounds[1])) - 1);
    const auto maximum_x = std::min(static_cast<int>(surface.buffer.width) - 1, static_cast<int>(std::ceil(bounds[2])) + 1);
    const auto maximum_y = std::min(static_cast<int>(surface.buffer.height) - 1, static_cast<int>(std::ceil(bounds[3])) + 1);
    if (minimum_x > maximum_x || minimum_y > maximum_y) {
        return;
    }

    std::vector<std::uint8_t> coverage(static_cast<std::size_t>(maximum_x - minimum_x + 1));
    std::vector<Crossing> crossings;
    for (auto y = minimum_y; y <= maximum_y; ++y) {
        std::ranges::fill(coverage, std::uint8_t{});
        for (const auto y_offset : sample_offsets) {
            const auto sample_y = static_cast<double>(y) + y_offset;
            crossings.clear();
            for (const auto& path : paths) {
                if (path.size() < 3U) {
                    continue;
                }
                for (std::size_t index = 0; index < path.size(); ++index) {
                    const auto first = path[index];
                    const auto second = path[(index + 1U) % path.size()];
                    if ((first.y <= sample_y && second.y > sample_y) || (second.y <= sample_y && first.y > sample_y)) {
                        const auto ratio = (sample_y - first.y) / (second.y - first.y);
                        crossings.push_back({first.x + ratio * (second.x - first.x), second.y > first.y ? 1 : -1});
                    }
                }
            }
            std::ranges::sort(crossings, {}, &Crossing::x);
            if (rule == FillRule::evenodd) {
                for (std::size_t index = 0; index + 1U < crossings.size(); index += 2U) {
                    add_interval_coverage(coverage, minimum_x, crossings[index].x, crossings[index + 1U].x);
                }
            } else {
                auto winding = 0;
                auto interval_start = 0.0;
                std::size_t index{};
                while (index < crossings.size()) {
                    const auto x = crossings[index].x;
                    if (winding != 0) {
                        add_interval_coverage(coverage, minimum_x, interval_start, x);
                    }
                    while (index < crossings.size() && std::abs(crossings[index].x - x) < 1.0e-10) {
                        winding += crossings[index].winding;
                        ++index;
                    }
                    interval_start = x;
                }
            }
        }
        for (auto x = minimum_x; x <= maximum_x; ++x) {
            const auto value = coverage[static_cast<std::size_t>(x - minimum_x)];
            if (value != 0U) {
                surface.blend(x, y, color, opacity, static_cast<double>(value) * 0.25);
            }
        }
    }
}

[[nodiscard]] auto distance_to_segment(Point point, Point start, Point end) -> double {
    const auto delta_x = end.x - start.x;
    const auto delta_y = end.y - start.y;
    const auto length_squared = delta_x * delta_x + delta_y * delta_y;
    if (length_squared <= 1.0e-20) {
        return std::hypot(point.x - start.x, point.y - start.y);
    }
    const auto projection = std::clamp(
        ((point.x - start.x) * delta_x + (point.y - start.y) * delta_y) / length_squared,
        0.0,
        1.0
    );
    return std::hypot(point.x - (start.x + projection * delta_x), point.y - (start.y + projection * delta_y));
}

void stroke_segment(
    RasterSurface& surface,
    Point start,
    Point end,
    double width,
    Color color,
    double opacity
) {
    const auto radius = width * 0.5;
    if (radius <= 0.0) {
        return;
    }
    const auto minimum_x = std::max(0, static_cast<int>(std::floor(std::min(start.x, end.x) - radius - 1.0)));
    const auto minimum_y = std::max(0, static_cast<int>(std::floor(std::min(start.y, end.y) - radius - 1.0)));
    const auto maximum_x = std::min(static_cast<int>(surface.buffer.width) - 1, static_cast<int>(std::ceil(std::max(start.x, end.x) + radius + 1.0)));
    const auto maximum_y = std::min(static_cast<int>(surface.buffer.height) - 1, static_cast<int>(std::ceil(std::max(start.y, end.y) + radius + 1.0)));
    for (auto y = minimum_y; y <= maximum_y; ++y) {
        for (auto x = minimum_x; x <= maximum_x; ++x) {
            auto covered = 0;
            for (const auto y_offset : sample_offsets) {
                for (const auto x_offset : sample_offsets) {
                    if (distance_to_segment({static_cast<double>(x) + x_offset, static_cast<double>(y) + y_offset}, start, end) <= radius) {
                        ++covered;
                    }
                }
            }
            if (covered > 0) {
                surface.blend(x, y, color, opacity, static_cast<double>(covered) * 0.25);
            }
        }
    }
}

void stroke_paths(
    RasterSurface& surface,
    const std::vector<std::pair<std::vector<Point>, bool>>& paths,
    double width,
    Color color,
    double opacity
) {
    for (const auto& [points, closed] : paths) {
        if (points.size() < 2U) {
            continue;
        }
        for (std::size_t index = 1; index < points.size(); ++index) {
            stroke_segment(surface, points[index - 1U], points[index], width, color, opacity);
        }
        if (closed) {
            stroke_segment(surface, points.back(), points.front(), width, color, opacity);
        }
    }
}

[[nodiscard]] auto matrix_scale(const Matrix& matrix) -> double {
    const auto horizontal = std::hypot(matrix.a, matrix.b);
    const auto vertical = std::hypot(matrix.c, matrix.d);
    return (horizontal + vertical) * 0.5;
}

void paint_geometry_paths(
    RasterSurface& surface,
    const Node& node,
    const Matrix& matrix,
    double opacity,
    const std::vector<std::pair<std::vector<Point>, bool>>& source_paths,
    FillRule fill_rule = FillRule::nonzero
) {
    std::vector<std::vector<Point>> fill_candidates;
    std::vector<std::pair<std::vector<Point>, bool>> stroke_candidates;
    fill_candidates.reserve(source_paths.size());
    stroke_candidates.reserve(source_paths.size());
    for (const auto& [points, closed] : source_paths) {
        auto transformed = transformed_points(points, matrix);
        if (transformed.size() >= 3U) {
            fill_candidates.push_back(transformed);
        }
        stroke_candidates.emplace_back(std::move(transformed), closed);
    }
    if (node.style.fill) {
        fill_paths(surface, fill_candidates, *node.style.fill, opacity, fill_rule);
    }
    if (node.style.stroke && node.style.stroke_width > 0.0) {
        stroke_paths(surface, stroke_candidates, node.style.stroke_width * matrix_scale(matrix), *node.style.stroke, opacity);
    }
}

[[nodiscard]] auto ascii_text(std::string_view value) -> std::string {
    std::string result;
    result.reserve(value.size());
    for (const auto character : value) {
        const auto byte = static_cast<unsigned char>(character);
        result.push_back(byte >= 32U && byte <= 126U ? character : '?');
    }
    return result;
}

void paint_text(
    RasterSurface& surface,
    const Node& node,
    const Text& text,
    const Matrix& matrix,
    double opacity
) {
    if (!node.style.fill || text.content.empty()) {
        return;
    }
    auto content = ascii_text(text.content);
    const auto easy_width = static_cast<double>(stb_easy_font_width(content.data()));
    const auto scale = text.font_size / 12.0;
    auto origin_x = text.x;
    if (text.anchor == TextAnchor::middle) {
        origin_x -= easy_width * scale * 0.5;
    } else if (text.anchor == TextAnchor::end) {
        origin_x -= easy_width * scale;
    }
    const auto origin_y = text.y - text.font_size;

    struct EasyVertex {
        float x;
        float y;
        float z;
        std::array<unsigned char, 4> color;
    };
    const auto vertex_capacity = std::max<std::size_t>(content.size() * 20U, 64U);
    std::vector<EasyVertex> vertices(vertex_capacity);
    const auto buffer_size = static_cast<int>(vertices.size() * sizeof(EasyVertex));
    const auto quads = stb_easy_font_print(
        0.0F,
        0.0F,
        content.data(),
        nullptr,
        reinterpret_cast<char*>(vertices.data()),
        buffer_size
    );
    std::vector<std::vector<Point>> polygons;
    polygons.reserve(static_cast<std::size_t>(std::max(0, quads)));
    for (auto index = 0; index < quads; ++index) {
        std::vector<Point> polygon;
        polygon.reserve(4U);
        for (auto vertex = 0; vertex < 4; ++vertex) {
            const auto& value = vertices[static_cast<std::size_t>(index * 4 + vertex)];
            polygon.push_back(matrix.apply({origin_x + static_cast<double>(value.x) * scale, origin_y + static_cast<double>(value.y) * scale}));
        }
        polygons.push_back(std::move(polygon));
    }
    fill_paths(surface, polygons, *node.style.fill, opacity, FillRule::nonzero);
}

void paint_node(RasterSurface& surface, const Node& node, const Matrix& parent, double parent_opacity) {
    if (!node.style.visible || node.style.opacity <= 0.0) {
        return;
    }
    const auto matrix = parent * node.transform;
    const auto opacity = parent_opacity * node.style.opacity;

    std::visit([&](const auto& geometry) {
        using Type = std::decay_t<decltype(geometry)>;
        if constexpr (std::is_same_v<Type, Rectangle>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{rectangle_points(geometry), true}});
        } else if constexpr (std::is_same_v<Type, Circle>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{ellipse_points(geometry.center_x, geometry.center_y, geometry.radius, geometry.radius), true}});
        } else if constexpr (std::is_same_v<Type, Ellipse>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{ellipse_points(geometry.center_x, geometry.center_y, geometry.radius_x, geometry.radius_y), true}});
        } else if constexpr (std::is_same_v<Type, Line>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{{geometry.start, geometry.end}, false}});
        } else if constexpr (std::is_same_v<Type, Polygon>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{geometry.points, true}});
        } else if constexpr (std::is_same_v<Type, Polyline>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{geometry.points, false}});
        } else if constexpr (std::is_same_v<Type, Path>) {
            const auto flattened = flatten_path(geometry.data);
            std::vector<std::pair<std::vector<Point>, bool>> paths;
            paths.reserve(flattened.subpaths.size());
            for (const auto& subpath : flattened.subpaths) {
                paths.emplace_back(subpath.points, subpath.closed);
            }
            paint_geometry_paths(surface, node, matrix, opacity, paths, geometry.fill_rule);
        } else if constexpr (std::is_same_v<Type, Text>) {
            paint_text(surface, node, geometry, matrix, opacity);
        } else if constexpr (std::is_same_v<Type, std::shared_ptr<Group>>) {
            if (geometry) {
                for (const auto& child : geometry->children) {
                    paint_node(surface, child, matrix, opacity);
                }
            }
        }
    }, node.geometry);
}

}

auto rasterize_scene(const Scene& scene, const RenderOptions& options) -> PixelBuffer {
    const auto width = options.width == 0U ? scene.document.width : options.width;
    const auto height = options.height == 0U ? scene.document.height : options.height;
    const auto pixel_count = static_cast<std::uint64_t>(width) * static_cast<std::uint64_t>(height);
    if (width == 0U || height == 0U || pixel_count > maximum_pixels) {
        return {};
    }

    RasterSurface surface{{width, height, std::vector<std::uint8_t>(static_cast<std::size_t>(pixel_count * 4ULL))}};
    const auto background = options.use_document_background ? scene.document.background : options.background;
    if (background) {
        for (std::uint32_t y = 0; y < height; ++y) {
            for (std::uint32_t x = 0; x < width; ++x) {
                surface.blend(static_cast<int>(x), static_cast<int>(y), *background, 1.0, 1.0);
            }
        }
    }

    const auto scale_x = static_cast<double>(width) / static_cast<double>(scene.document.width);
    const auto scale_y = static_cast<double>(height) / static_cast<double>(scene.document.height);
    const auto document_transform = Matrix::scaling(scale_x, scale_y);
    for (const auto& node : scene.objects) {
        paint_node(surface, node, document_transform, 1.0);
    }
    return std::move(surface.buffer);
}

}
