#include "vector_engine/path.hpp"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstddef>
#include <optional>
#include <ranges>
#include <string_view>

namespace vector_engine {

namespace {

constexpr auto pi = 3.141592653589793238462643383279502884;
constexpr std::size_t maximum_flattened_points = 250'000U;

class Scanner {
public:
    explicit Scanner(std::string_view source) : source_{source} {}

    void skip_separators() {
        while (position_ < source_.size()) {
            const auto character = source_[position_];
            if (character == ',' || character == ' ' || character == '\t' || character == '\r' || character == '\n') {
                ++position_;
            } else {
                break;
            }
        }
    }

    [[nodiscard]] auto empty() -> bool {
        skip_separators();
        return position_ >= source_.size();
    }

    [[nodiscard]] auto has_command() -> bool {
        skip_separators();
        if (position_ >= source_.size()) {
            return false;
        }
        const auto character = source_[position_];
        return (character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z');
    }

    [[nodiscard]] auto read_command() -> std::optional<char> {
        if (!has_command()) {
            return std::nullopt;
        }
        return source_[position_++];
    }

    [[nodiscard]] auto read_number() -> std::optional<double> {
        skip_separators();
        if (position_ >= source_.size() || has_command()) {
            return std::nullopt;
        }
        const auto* begin = source_.data() + position_;
        const auto* end = source_.data() + source_.size();
        double value{};
        const auto result = std::from_chars(begin, end, value, std::chars_format::general);
        if (result.ec != std::errc{} || result.ptr == begin || !std::isfinite(value)) {
            return std::nullopt;
        }
        position_ = static_cast<std::size_t>(result.ptr - source_.data());
        return value;
    }

private:
    std::string_view source_;
    std::size_t position_{};
};

[[nodiscard]] auto distance(Point left, Point right) -> double {
    return std::hypot(right.x - left.x, right.y - left.y);
}

[[nodiscard]] auto reflected(Point control, Point around) -> Point {
    return {2.0 * around.x - control.x, 2.0 * around.y - control.y};
}

[[nodiscard]] auto point_on_cubic(Point start, Point first, Point second, Point end, double time) -> Point {
    const auto inverse = 1.0 - time;
    const auto a = inverse * inverse * inverse;
    const auto b = 3.0 * inverse * inverse * time;
    const auto c = 3.0 * inverse * time * time;
    const auto d = time * time * time;
    return {
        a * start.x + b * first.x + c * second.x + d * end.x,
        a * start.y + b * first.y + c * second.y + d * end.y
    };
}

[[nodiscard]] auto point_on_quadratic(Point start, Point control, Point end, double time) -> Point {
    const auto inverse = 1.0 - time;
    return {
        inverse * inverse * start.x + 2.0 * inverse * time * control.x + time * time * end.x,
        inverse * inverse * start.y + 2.0 * inverse * time * control.y + time * time * end.y
    };
}

[[nodiscard]] auto append_cubic(
    FlattenedSubpath& subpath,
    Point start,
    Point first,
    Point second,
    Point end,
    double tolerance
) -> std::size_t {
    const auto length = distance(start, first) + distance(first, second) + distance(second, end);
    const auto segments = std::clamp(static_cast<int>(std::ceil(length / std::max(0.1, tolerance * 6.0))), 4, 128);
    subpath.points.reserve(subpath.points.size() + static_cast<std::size_t>(segments));
    for (int index = 1; index <= segments; ++index) {
        subpath.points.push_back(point_on_cubic(start, first, second, end, static_cast<double>(index) / segments));
    }
    return static_cast<std::size_t>(segments);
}

[[nodiscard]] auto append_quadratic(
    FlattenedSubpath& subpath,
    Point start,
    Point control,
    Point end,
    double tolerance
) -> std::size_t {
    const auto length = distance(start, control) + distance(control, end);
    const auto segments = std::clamp(static_cast<int>(std::ceil(length / std::max(0.1, tolerance * 6.0))), 3, 96);
    subpath.points.reserve(subpath.points.size() + static_cast<std::size_t>(segments));
    for (int index = 1; index <= segments; ++index) {
        subpath.points.push_back(point_on_quadratic(start, control, end, static_cast<double>(index) / segments));
    }
    return static_cast<std::size_t>(segments);
}

[[nodiscard]] auto vector_angle(double ux, double uy, double vx, double vy) -> double {
    return std::atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

[[nodiscard]] auto append_arc(
    FlattenedSubpath& subpath,
    Point start,
    double radius_x,
    double radius_y,
    double rotation,
    bool large_arc,
    bool sweep,
    Point end,
    double tolerance
) -> std::size_t {
    radius_x = std::abs(radius_x);
    radius_y = std::abs(radius_y);
    if (radius_x < 1.0e-12 || radius_y < 1.0e-12 || distance(start, end) < 1.0e-12) {
        subpath.points.push_back(end);
        return 1U;
    }

    const auto angle = rotation * pi / 180.0;
    const auto cosine = std::cos(angle);
    const auto sine = std::sin(angle);
    const auto half_x = (start.x - end.x) * 0.5;
    const auto half_y = (start.y - end.y) * 0.5;
    const auto transformed_x = cosine * half_x + sine * half_y;
    const auto transformed_y = -sine * half_x + cosine * half_y;

    auto radius_x_squared = radius_x * radius_x;
    auto radius_y_squared = radius_y * radius_y;
    const auto transformed_x_squared = transformed_x * transformed_x;
    const auto transformed_y_squared = transformed_y * transformed_y;
    const auto radii_scale = transformed_x_squared / radius_x_squared + transformed_y_squared / radius_y_squared;
    if (radii_scale > 1.0) {
        const auto scale = std::sqrt(radii_scale);
        radius_x *= scale;
        radius_y *= scale;
        radius_x_squared = radius_x * radius_x;
        radius_y_squared = radius_y * radius_y;
    }

    const auto numerator = radius_x_squared * radius_y_squared -
        radius_x_squared * transformed_y_squared - radius_y_squared * transformed_x_squared;
    const auto denominator = radius_x_squared * transformed_y_squared + radius_y_squared * transformed_x_squared;
    const auto sign = large_arc == sweep ? -1.0 : 1.0;
    const auto factor = denominator <= 0.0 ? 0.0 : sign * std::sqrt(std::max(0.0, numerator / denominator));
    const auto center_transformed_x = factor * radius_x * transformed_y / radius_y;
    const auto center_transformed_y = factor * -radius_y * transformed_x / radius_x;
    const auto center_x = cosine * center_transformed_x - sine * center_transformed_y + (start.x + end.x) * 0.5;
    const auto center_y = sine * center_transformed_x + cosine * center_transformed_y + (start.y + end.y) * 0.5;

    const auto unit_start_x = (transformed_x - center_transformed_x) / radius_x;
    const auto unit_start_y = (transformed_y - center_transformed_y) / radius_y;
    const auto unit_end_x = (-transformed_x - center_transformed_x) / radius_x;
    const auto unit_end_y = (-transformed_y - center_transformed_y) / radius_y;
    const auto start_angle = vector_angle(1.0, 0.0, unit_start_x, unit_start_y);
    auto delta_angle = vector_angle(unit_start_x, unit_start_y, unit_end_x, unit_end_y);
    if (!sweep && delta_angle > 0.0) {
        delta_angle -= 2.0 * pi;
    }
    if (sweep && delta_angle < 0.0) {
        delta_angle += 2.0 * pi;
    }

    const auto approximate_length = std::abs(delta_angle) * std::max(radius_x, radius_y);
    const auto segments = std::clamp(static_cast<int>(std::ceil(approximate_length / std::max(0.1, tolerance * 6.0))), 4, 256);
    subpath.points.reserve(subpath.points.size() + static_cast<std::size_t>(segments));
    for (int index = 1; index <= segments; ++index) {
        const auto current_angle = start_angle + delta_angle * static_cast<double>(index) / segments;
        const auto ellipse_x = radius_x * std::cos(current_angle);
        const auto ellipse_y = radius_y * std::sin(current_angle);
        subpath.points.push_back({
            center_x + cosine * ellipse_x - sine * ellipse_y,
            center_y + sine * ellipse_x + cosine * ellipse_y
        });
    }
    if (!subpath.points.empty()) {
        subpath.points.back() = end;
    }
    return static_cast<std::size_t>(segments);
}

[[nodiscard]] auto supported_command(char command) -> bool {
    switch (command) {
        case 'M': case 'm': case 'L': case 'l': case 'H': case 'h': case 'V': case 'v':
        case 'C': case 'c': case 'S': case 's': case 'Q': case 'q': case 'T': case 't':
        case 'A': case 'a': case 'Z': case 'z':
            return true;
        default:
            return false;
    }
}

}

auto flatten_path(std::string_view data, double tolerance) -> FlattenedPath {
    FlattenedPath result;
    Scanner scanner{data};
    char command{};
    char previous_command{};
    Point current{};
    Point subpath_start{};
    Point previous_cubic_control{};
    Point previous_quadratic_control{};
    FlattenedSubpath* subpath = nullptr;
    std::size_t total_points{};

    const auto invalidate = [&]() -> FlattenedPath {
        result.valid = false;
        return result;
    };
    const auto read = [&]() -> std::optional<double> {
        return scanner.read_number();
    };
    const auto make_point = [&](double x, double y, bool relative) -> Point {
        return relative ? Point{current.x + x, current.y + y} : Point{x, y};
    };
    const auto require_subpath = [&]() {
        return subpath != nullptr;
    };

    while (!scanner.empty()) {
        if (scanner.has_command()) {
            const auto value = scanner.read_command();
            if (!value || !supported_command(*value)) {
                return invalidate();
            }
            command = *value;
        } else if (command == 0) {
            return invalidate();
        }

        const auto relative = command >= 'a' && command <= 'z';
        const auto normalized = relative ? static_cast<char>(command - 'a' + 'A') : command;

        if (normalized == 'Z') {
            if (!require_subpath()) {
                return invalidate();
            }
            subpath->closed = true;
            current = subpath_start;
            previous_command = command;
            command = 0;
            continue;
        }

        if (normalized == 'M' || normalized == 'L') {
            const auto x = read();
            const auto y = read();
            if (!x || !y) {
                return invalidate();
            }
            const auto point = make_point(*x, *y, relative);
            if (normalized == 'M') {
                result.subpaths.push_back({{{point}}, false});
                subpath = &result.subpaths.back();
                subpath_start = point;
                current = point;
                ++total_points;
                command = relative ? 'l' : 'L';
            } else {
                if (!require_subpath()) {
                    return invalidate();
                }
                subpath->points.push_back(point);
                current = point;
                ++total_points;
            }
        } else if (normalized == 'H') {
            const auto x = read();
            if (!x || !require_subpath()) {
                return invalidate();
            }
            current.x = relative ? current.x + *x : *x;
            subpath->points.push_back(current);
            ++total_points;
        } else if (normalized == 'V') {
            const auto y = read();
            if (!y || !require_subpath()) {
                return invalidate();
            }
            current.y = relative ? current.y + *y : *y;
            subpath->points.push_back(current);
            ++total_points;
        } else if (normalized == 'C') {
            const auto x1 = read();
            const auto y1 = read();
            const auto x2 = read();
            const auto y2 = read();
            const auto x = read();
            const auto y = read();
            if (!x1 || !y1 || !x2 || !y2 || !x || !y || !require_subpath()) {
                return invalidate();
            }
            const auto first = make_point(*x1, *y1, relative);
            const auto second = make_point(*x2, *y2, relative);
            const auto end = make_point(*x, *y, relative);
            total_points += append_cubic(*subpath, current, first, second, end, tolerance);
            previous_cubic_control = second;
            current = end;
        } else if (normalized == 'S') {
            const auto x2 = read();
            const auto y2 = read();
            const auto x = read();
            const auto y = read();
            if (!x2 || !y2 || !x || !y || !require_subpath()) {
                return invalidate();
            }
            const auto previous_normalized = previous_command >= 'a' && previous_command <= 'z'
                ? static_cast<char>(previous_command - 'a' + 'A')
                : previous_command;
            const auto first = previous_normalized == 'C' || previous_normalized == 'S'
                ? reflected(previous_cubic_control, current)
                : current;
            const auto second = make_point(*x2, *y2, relative);
            const auto end = make_point(*x, *y, relative);
            total_points += append_cubic(*subpath, current, first, second, end, tolerance);
            previous_cubic_control = second;
            current = end;
        } else if (normalized == 'Q') {
            const auto x1 = read();
            const auto y1 = read();
            const auto x = read();
            const auto y = read();
            if (!x1 || !y1 || !x || !y || !require_subpath()) {
                return invalidate();
            }
            const auto control = make_point(*x1, *y1, relative);
            const auto end = make_point(*x, *y, relative);
            total_points += append_quadratic(*subpath, current, control, end, tolerance);
            previous_quadratic_control = control;
            current = end;
        } else if (normalized == 'T') {
            const auto x = read();
            const auto y = read();
            if (!x || !y || !require_subpath()) {
                return invalidate();
            }
            const auto previous_normalized = previous_command >= 'a' && previous_command <= 'z'
                ? static_cast<char>(previous_command - 'a' + 'A')
                : previous_command;
            const auto control = previous_normalized == 'Q' || previous_normalized == 'T'
                ? reflected(previous_quadratic_control, current)
                : current;
            const auto end = make_point(*x, *y, relative);
            total_points += append_quadratic(*subpath, current, control, end, tolerance);
            previous_quadratic_control = control;
            current = end;
        } else if (normalized == 'A') {
            const auto radius_x = read();
            const auto radius_y = read();
            const auto rotation = read();
            const auto large_arc = read();
            const auto sweep = read();
            const auto x = read();
            const auto y = read();
            if (!radius_x || !radius_y || !rotation || !large_arc || !sweep || !x || !y || !require_subpath()) {
                return invalidate();
            }
            if ((*large_arc != 0.0 && *large_arc != 1.0) || (*sweep != 0.0 && *sweep != 1.0)) {
                return invalidate();
            }
            const auto end = make_point(*x, *y, relative);
            total_points += append_arc(*subpath, current, *radius_x, *radius_y, *rotation, *large_arc == 1.0, *sweep == 1.0, end, tolerance);
            current = end;
        } else {
            return invalidate();
        }

        previous_command = command;
        if (total_points > maximum_flattened_points) {
            return invalidate();
        }
    }

    result.valid = !result.subpaths.empty() && std::ranges::all_of(result.subpaths, [](const FlattenedSubpath& value) {
        return !value.points.empty();
    });
    return result;
}

}
