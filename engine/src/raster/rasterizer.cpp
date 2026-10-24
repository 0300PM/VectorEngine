#include "vector_engine/rasterizer.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <ranges>
#include <string>
#include <type_traits>
#include <unordered_map>
#include <utility>
#include <vector>

#include <stb_easy_font.h>

#include "vector_engine/path.hpp"

namespace vector_engine {

namespace {

constexpr auto pi = 3.141592653589793238462643383279502884;
constexpr std::uint64_t maximum_pixels = 67'108'864ULL;
constexpr std::array sample_offsets{0.25, 0.75};

struct ScissorRect {
    int min_x{};
    int min_y{};
    int max_x{};
    int max_y{};
};

struct InverseMatrix {
    double a{1.0};
    double b{};
    double c{};
    double d{1.0};
    double e{};
    double f{};
    bool valid{true};

    [[nodiscard]] auto apply(Point point) const -> Point {
        return {a * point.x + c * point.y + e, b * point.x + d * point.y + f};
    }
};

[[nodiscard]] auto invert_matrix(const Matrix& m) -> InverseMatrix {
    const auto det = m.a * m.d - m.b * m.c;
    if (std::abs(det) < 1.0e-15) {
        return {.valid = false};
    }
    const auto inv = 1.0 / det;
    return {
        m.d * inv,
        -m.b * inv,
        -m.c * inv,
        m.a * inv,
        (m.c * m.f - m.d * m.e) * inv,
        (m.b * m.e - m.a * m.f) * inv,
        true
    };
}

[[nodiscard]] auto apply_spread(double t, SpreadMethod method) -> double {
    if (method == SpreadMethod::pad) {
        return std::clamp(t, 0.0, 1.0);
    }
    if (method == SpreadMethod::repeat) {
        return t - std::floor(t);
    }
    const auto period = t - 2.0 * std::floor(t * 0.5);
    return period <= 1.0 ? period : 2.0 - period;
}

[[nodiscard]] auto sample_stops(const std::vector<GradientStop>& stops, double raw_t, SpreadMethod spread) -> Color {
    if (stops.empty()) {
        return {0U, 0U, 0U, 0U};
    }
    const auto t = apply_spread(raw_t, spread);
    if (t <= stops.front().offset || stops.size() == 1U) {
        auto c = stops.front().color;
        c.alpha = static_cast<std::uint8_t>(std::lround(static_cast<double>(c.alpha) * stops.front().opacity));
        return c;
    }
    if (t >= stops.back().offset) {
        auto c = stops.back().color;
        c.alpha = static_cast<std::uint8_t>(std::lround(static_cast<double>(c.alpha) * stops.back().opacity));
        return c;
    }
    for (std::size_t index = 1U; index < stops.size(); ++index) {
        const auto& right = stops[index];
        if (t <= right.offset) {
            const auto& left = stops[index - 1U];
            const auto span = right.offset - left.offset;
            const auto ratio = span <= 1.0e-12 ? 0.0 : (t - left.offset) / span;
            const auto left_a = static_cast<double>(left.color.alpha) * left.opacity;
            const auto right_a = static_cast<double>(right.color.alpha) * right.opacity;
            return Color{
                static_cast<std::uint8_t>(std::clamp(std::lround(left.color.red + (right.color.red - left.color.red) * ratio), 0L, 255L)),
                static_cast<std::uint8_t>(std::clamp(std::lround(left.color.green + (right.color.green - left.color.green) * ratio), 0L, 255L)),
                static_cast<std::uint8_t>(std::clamp(std::lround(left.color.blue + (right.color.blue - left.color.blue) * ratio), 0L, 255L)),
                static_cast<std::uint8_t>(std::clamp(std::lround(left_a + (right_a - left_a) * ratio), 0L, 255L))
            };
        }
    }
    return stops.back().color;
}

struct PaintSource {
    std::optional<Color> solid;
    const Gradient* gradient{nullptr};
    BoundingBox local_bbox{};
    InverseMatrix device_to_local{};

    [[nodiscard]] auto empty() const -> bool {
        return !solid.has_value() && gradient == nullptr;
    }

    [[nodiscard]] auto color_at(int px, int py) const -> Color {
        if (solid) {
            return *solid;
        }
        if (!gradient || !device_to_local.valid) {
            return {0U, 0U, 0U, 0U};
        }
        const auto local = device_to_local.apply({static_cast<double>(px) + 0.5, static_cast<double>(py) + 0.5});
        return std::visit([&](const auto& item) -> Color {
            using Type = std::decay_t<decltype(item)>;
            Point coord = local;
            if (item.units == GradientUnits::object_bounding_box) {
                const auto bw = std::max(1.0e-9, local_bbox.width());
                const auto bh = std::max(1.0e-9, local_bbox.height());
                coord = {(local.x - local_bbox.min_x) / bw, (local.y - local_bbox.min_y) / bh};
            }
            if constexpr (std::is_same_v<Type, LinearGradient>) {
                const auto dx = item.x2 - item.x1;
                const auto dy = item.y2 - item.y1;
                const auto len_sq = dx * dx + dy * dy;
                const auto t = len_sq <= 1.0e-15 ? 0.0 : ((coord.x - item.x1) * dx + (coord.y - item.y1) * dy) / len_sq;
                return sample_stops(item.stops, t, item.spread);
            } else {
                const auto radius = std::max(1.0e-9, item.r);
                const auto t = std::hypot(coord.x - item.cx, coord.y - item.cy) / radius;
                return sample_stops(item.stops, t, item.spread);
            }
        }, *gradient);
    }
};

struct RasterSurface {
    PixelBuffer buffer;
    ScissorRect scissor;

    void fill_solid_background(Color color) {
        const std::array<std::uint8_t, 4> pixel{color.red, color.green, color.blue, color.alpha};
        std::uint32_t packed{};
        std::memcpy(&packed, pixel.data(), sizeof(packed));
        auto* dst = reinterpret_cast<std::uint32_t*>(buffer.pixels.data());
        std::fill_n(dst, static_cast<std::size_t>(buffer.width) * buffer.height, packed);
    }

    void blend(int x, int y, Color color, double opacity, double coverage) {
        if (x < scissor.min_x || y < scissor.min_y || x > scissor.max_x || y > scissor.max_y) {
            return;
        }
        const auto index = (static_cast<std::size_t>(y) * buffer.width + static_cast<std::size_t>(x)) * 4U;
        if (color.alpha == 255U && opacity >= 0.999999 && coverage >= 0.999999) {
            buffer.pixels[index] = color.red;
            buffer.pixels[index + 1U] = color.green;
            buffer.pixels[index + 2U] = color.blue;
            buffer.pixels[index + 3U] = 255U;
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
        const auto destination_alpha = static_cast<double>(buffer.pixels[index + 3U]) / 255.0;
        const auto output_alpha = source_alpha + destination_alpha * (1.0 - source_alpha);
        if (output_alpha <= 0.0) {
            return;
        }
        const auto inv_out = 1.0 / output_alpha;
        const auto keep = destination_alpha * (1.0 - source_alpha);
        buffer.pixels[index] = static_cast<std::uint8_t>(std::clamp(
            std::lround((static_cast<double>(color.red) * source_alpha + static_cast<double>(buffer.pixels[index]) * keep) * inv_out),
            0L, 255L
        ));
        buffer.pixels[index + 1U] = static_cast<std::uint8_t>(std::clamp(
            std::lround((static_cast<double>(color.green) * source_alpha + static_cast<double>(buffer.pixels[index + 1U]) * keep) * inv_out),
            0L, 255L
        ));
        buffer.pixels[index + 2U] = static_cast<std::uint8_t>(std::clamp(
            std::lround((static_cast<double>(color.blue) * source_alpha + static_cast<double>(buffer.pixels[index + 2U]) * keep) * inv_out),
            0L, 255L
        ));
        buffer.pixels[index + 3U] = static_cast<std::uint8_t>(std::clamp(std::lround(output_alpha * 255.0), 0L, 255L));
    }
};

struct Crossing {
    double x{};
    int winding{};
};

struct PaintContext {
    std::unordered_map<std::string, const Gradient*> gradients;
    std::vector<Issue>* issues{nullptr};
    bool warned_non_ascii{false};
    bool warned_blend_mode{false};
};

[[nodiscard]] auto local_paths_bbox(const std::vector<std::pair<std::vector<Point>, bool>>& paths) -> BoundingBox {
    auto min_x = std::numeric_limits<double>::infinity();
    auto min_y = std::numeric_limits<double>::infinity();
    auto max_x = -std::numeric_limits<double>::infinity();
    auto max_y = -std::numeric_limits<double>::infinity();
    for (const auto& [points, closed] : paths) {
        static_cast<void>(closed);
        for (const auto point : points) {
            min_x = std::min(min_x, point.x);
            min_y = std::min(min_y, point.y);
            max_x = std::max(max_x, point.x);
            max_y = std::max(max_y, point.y);
        }
    }
    if (!std::isfinite(min_x)) {
        return {0.0, 0.0, 1.0, 1.0};
    }
    return {min_x, min_y, max_x, max_y};
}

[[nodiscard]] auto make_paint(
    const std::optional<Color>& solid,
    const std::optional<std::string>& gradient_id,
    const PaintContext& context,
    const BoundingBox& local_bbox,
    const InverseMatrix& device_to_local
) -> PaintSource {
    if (solid) {
        return {solid, nullptr, local_bbox, device_to_local};
    }
    if (gradient_id) {
        if (const auto it = context.gradients.find(*gradient_id); it != context.gradients.end()) {
            return {std::nullopt, it->second, local_bbox, device_to_local};
        }
    }
    return {};
}

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
    const auto first_pixel = std::max(minimum_x, static_cast<int>(std::floor(start - 0.75)));
    const auto last_pixel = std::min(minimum_x + static_cast<int>(coverage.size()) - 1, static_cast<int>(std::floor(end - 0.25)));
    for (auto x = first_pixel; x <= last_pixel; ++x) {
        const auto index = static_cast<std::size_t>(x - minimum_x);
        for (const auto offset : sample_offsets) {
            const auto sample_x = static_cast<double>(x) + offset;
            if (sample_x >= start && sample_x < end) {
                coverage[index] += 1U;
            }
        }
    }
}

void fill_paths(
    RasterSurface& surface,
    const std::vector<std::vector<Point>>& paths,
    const PaintSource& paint,
    double opacity,
    FillRule rule
) {
    if (paths.empty() || paint.empty()) {
        return;
    }
    const auto bounds = bounds_of_paths(paths);
    if (!std::isfinite(bounds[0])) {
        return;
    }
    const auto minimum_x = std::max(surface.scissor.min_x, static_cast<int>(std::floor(bounds[0])) - 1);
    const auto minimum_y = std::max(surface.scissor.min_y, static_cast<int>(std::floor(bounds[1])) - 1);
    const auto maximum_x = std::min(surface.scissor.max_x, static_cast<int>(std::ceil(bounds[2])) + 1);
    const auto maximum_y = std::min(surface.scissor.max_y, static_cast<int>(std::ceil(bounds[3])) + 1);
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
                surface.blend(x, y, paint.color_at(x, y), opacity, static_cast<double>(value) * 0.25);
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
    const PaintSource& paint,
    double opacity
) {
    const auto radius = width * 0.5;
    if (radius <= 0.0 || paint.empty()) {
        return;
    }
    const auto minimum_x = std::max(surface.scissor.min_x, static_cast<int>(std::floor(std::min(start.x, end.x) - radius - 1.0)));
    const auto minimum_y = std::max(surface.scissor.min_y, static_cast<int>(std::floor(std::min(start.y, end.y) - radius - 1.0)));
    const auto maximum_x = std::min(surface.scissor.max_x, static_cast<int>(std::ceil(std::max(start.x, end.x) + radius + 1.0)));
    const auto maximum_y = std::min(surface.scissor.max_y, static_cast<int>(std::ceil(std::max(start.y, end.y) + radius + 1.0)));
    if (minimum_x > maximum_x || minimum_y > maximum_y) {
        return;
    }
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
                surface.blend(x, y, paint.color_at(x, y), opacity, static_cast<double>(covered) * 0.25);
            }
        }
    }
}

void stroke_paths(
    RasterSurface& surface,
    const std::vector<std::pair<std::vector<Point>, bool>>& paths,
    double width,
    const PaintSource& paint,
    double opacity
) {
    for (const auto& [points, closed] : paths) {
        if (points.size() < 2U) {
            continue;
        }
        for (std::size_t index = 1; index < points.size(); ++index) {
            stroke_segment(surface, points[index - 1U], points[index], width, paint, opacity);
        }
        if (closed) {
            stroke_segment(surface, points.back(), points.front(), width, paint, opacity);
        }
    }
}

[[nodiscard]] auto matrix_scale(const Matrix& matrix) -> double {
    return (std::hypot(matrix.a, matrix.b) + std::hypot(matrix.c, matrix.d)) * 0.5;
}

void paint_geometry_paths(
    RasterSurface& surface,
    const Node& node,
    const Matrix& matrix,
    double opacity,
    const std::vector<std::pair<std::vector<Point>, bool>>& source_paths,
    PaintContext& context,
    FillRule fill_rule = FillRule::nonzero
) {
    const bool wants_fill = node.style.fill.has_value() || node.style.fill_gradient_id.has_value();
    const bool wants_stroke = (node.style.stroke.has_value() || node.style.stroke_gradient_id.has_value()) && node.style.stroke_width > 0.0;
    if (!wants_fill && !wants_stroke) {
        return;
    }

    const bool needs_inverse = node.style.fill_gradient_id.has_value() || node.style.stroke_gradient_id.has_value();
    const auto local_box = needs_inverse ? local_paths_bbox(source_paths) : BoundingBox{};
    const auto inv_matrix = needs_inverse ? invert_matrix(matrix) : InverseMatrix{};

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

    if (wants_fill) {
        const auto paint = make_paint(node.style.fill, node.style.fill_gradient_id, context, local_box, inv_matrix);
        fill_paths(surface, fill_candidates, paint, opacity, fill_rule);
    }
    if (wants_stroke) {
        const auto paint = make_paint(node.style.stroke, node.style.stroke_gradient_id, context, local_box, inv_matrix);
        stroke_paths(surface, stroke_candidates, node.style.stroke_width * matrix_scale(matrix), paint, opacity);
    }
}

[[nodiscard]] auto ascii_text(std::string_view value, bool& had_non_ascii) -> std::string {
    std::string result;
    result.reserve(value.size());
    for (const auto character : value) {
        const auto byte = static_cast<unsigned char>(character);
        if (byte >= 32U && byte <= 126U) {
            result.push_back(character);
        } else {
            had_non_ascii = true;
            result.push_back('?');
        }
    }
    return result;
}

void paint_text(
    RasterSurface& surface,
    const Node& node,
    const Text& text,
    const Matrix& matrix,
    double opacity,
    PaintContext& context
) {
    if ((!node.style.fill && !node.style.fill_gradient_id) || text.content.empty()) {
        return;
    }
    bool had_non_ascii = false;
    auto content = ascii_text(text.content, had_non_ascii);
    if (had_non_ascii && context.issues && !context.warned_non_ascii) {
        context.warned_non_ascii = true;
        context.issues->push_back({
            "raster.nonAsciiText",
            "Non-ASCII glyphs were substituted during built-in vector font rasterization",
            "/objects",
            Severity::warning
        });
    }

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
    const BoundingBox text_bbox{origin_x, origin_y, origin_x + std::max(1.0, easy_width * scale), text.y};
    const auto paint = make_paint(node.style.fill, node.style.fill_gradient_id, context, text_bbox, invert_matrix(matrix));
    fill_paths(surface, polygons, paint, opacity, FillRule::nonzero);
}

void paint_node(
    RasterSurface& surface,
    const Node& node,
    const Matrix& parent,
    double parent_opacity,
    bool include_hidden,
    PaintContext& context
) {
    if ((!include_hidden && !node.style.visible) || node.style.opacity <= 0.0) {
        return;
    }
    if (node.style.blend_mode != BlendMode::normal && context.issues && !context.warned_blend_mode) {
        context.warned_blend_mode = true;
        context.issues->push_back({
            "unsupported.blendMode",
            "Non-normal blend modes render using normal source-over compositing in raster export",
            "/objects",
            Severity::warning
        });
    }
    const auto matrix = parent * node.transform;
    const auto opacity = parent_opacity * node.style.opacity;

    std::visit([&](const auto& geometry) {
        using Type = std::decay_t<decltype(geometry)>;
        if constexpr (std::is_same_v<Type, Rectangle>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{rectangle_points(geometry), true}}, context);
        } else if constexpr (std::is_same_v<Type, Circle>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{ellipse_points(geometry.center_x, geometry.center_y, geometry.radius, geometry.radius), true}}, context);
        } else if constexpr (std::is_same_v<Type, Ellipse>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{ellipse_points(geometry.center_x, geometry.center_y, geometry.radius_x, geometry.radius_y), true}}, context);
        } else if constexpr (std::is_same_v<Type, Line>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{{geometry.start, geometry.end}, false}}, context);
        } else if constexpr (std::is_same_v<Type, Polygon>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{geometry.points, true}}, context);
        } else if constexpr (std::is_same_v<Type, Polyline>) {
            paint_geometry_paths(surface, node, matrix, opacity, {{geometry.points, false}}, context);
        } else if constexpr (std::is_same_v<Type, Path>) {
            const auto flattened = flatten_path(geometry.data);
            std::vector<std::pair<std::vector<Point>, bool>> paths;
            paths.reserve(flattened.subpaths.size());
            for (const auto& subpath : flattened.subpaths) {
                paths.emplace_back(subpath.points, subpath.closed);
            }
            paint_geometry_paths(surface, node, matrix, opacity, paths, context, geometry.fill_rule);
        } else if constexpr (std::is_same_v<Type, Text>) {
            paint_text(surface, node, geometry, matrix, opacity, context);
        } else if constexpr (std::is_same_v<Type, std::shared_ptr<Group>>) {
            if (geometry) {
                for (const auto& child : geometry->children) {
                    paint_node(surface, child, matrix, opacity, include_hidden, context);
                }
            }
        }
    }, node.geometry);
}

}

auto rasterize_viewport(
    const Scene& scene,
    const Viewport& viewport,
    const RenderOptions& options,
    std::vector<Issue>& issues
) -> PixelBuffer {
    const auto width = viewport.output_width;
    const auto height = viewport.output_height;
    const auto pixel_count = static_cast<std::uint64_t>(width) * static_cast<std::uint64_t>(height);
    if (width == 0U || height == 0U || pixel_count > maximum_pixels) {
        return {};
    }

    ScissorRect full_scissor{0, 0, static_cast<int>(width) - 1, static_cast<int>(height) - 1};
    ScissorRect draw_scissor = full_scissor;
    if (viewport.clip_to_source) {
        const auto top_left = viewport.world_to_device.apply({viewport.source_box.min_x, viewport.source_box.min_y});
        const auto bottom_right = viewport.world_to_device.apply({viewport.source_box.max_x, viewport.source_box.max_y});
        draw_scissor = {
            std::max(0, static_cast<int>(std::floor(std::min(top_left.x, bottom_right.x)))),
            std::max(0, static_cast<int>(std::floor(std::min(top_left.y, bottom_right.y)))),
            std::min(static_cast<int>(width) - 1, static_cast<int>(std::ceil(std::max(top_left.x, bottom_right.x))) - 1),
            std::min(static_cast<int>(height) - 1, static_cast<int>(std::ceil(std::max(top_left.y, bottom_right.y))) - 1)
        };
    }

    RasterSurface surface{
        {width, height, std::vector<std::uint8_t>(static_cast<std::size_t>(pixel_count * 4ULL))},
        full_scissor
    };

    const auto background = options.use_document_background ? scene.document.background : options.background;
    if (background) {
        surface.fill_solid_background(*background);
    }

    surface.scissor = draw_scissor;
    PaintContext context{};
    context.issues = &issues;
    for (const auto& gradient : scene.gradients) {
        const auto& id = std::visit([](const auto& item) -> const std::string& { return item.id; }, gradient);
        context.gradients.emplace(id, &gradient);
    }

    for (const auto& layer : scene.layers) {
        if (!options.include_hidden && !layer.visible) {
            continue;
        }
        if (layer.opacity <= 0.0) {
            continue;
        }
        for (const auto& node : layer.objects) {
            paint_node(surface, node, viewport.world_to_device, layer.opacity, options.include_hidden, context);
        }
    }
    for (const auto& node : scene.objects) {
        paint_node(surface, node, viewport.world_to_device, 1.0, options.include_hidden, context);
    }
    return std::move(surface.buffer);
}

auto rasterize_scene(const Scene& scene, const RenderOptions& options) -> PixelBuffer {
    std::vector<Issue> issues;
    const auto scoped = prepare_scoped_scene(scene, options.target, options.include_hidden, issues);
    if (!scoped) {
        return {};
    }
    const auto viewport = resolve_viewport(scene, *scoped, options, 0ULL, issues);
    if (!viewport) {
        return {};
    }
    return rasterize_viewport(*scoped, *viewport, options, issues);
}

}
