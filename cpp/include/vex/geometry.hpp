#pragma once

#include <algorithm>
#include <cmath>
#include <limits>
#include <optional>

namespace vex {

struct Point {
  double x{};
  double y{};

  [[nodiscard]] constexpr Point operator+(Point other) const noexcept { return {x + other.x, y + other.y}; }
  [[nodiscard]] constexpr Point operator-(Point other) const noexcept { return {x - other.x, y - other.y}; }
  [[nodiscard]] constexpr Point operator*(double factor) const noexcept { return {x * factor, y * factor}; }
  [[nodiscard]] constexpr bool operator==(const Point&) const noexcept = default;
};

[[nodiscard]] constexpr double dot(Point lhs, Point rhs) noexcept { return lhs.x * rhs.x + lhs.y * rhs.y; }

[[nodiscard]] constexpr double cross(Point lhs, Point rhs) noexcept { return lhs.x * rhs.y - lhs.y * rhs.x; }

[[nodiscard]] inline double length(Point value) noexcept { return std::hypot(value.x, value.y); }

[[nodiscard]] constexpr Point lerp(Point from, Point to, double t) noexcept {
  return {from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t};
}

struct Bounds {
  double min_x{std::numeric_limits<double>::infinity()};
  double min_y{std::numeric_limits<double>::infinity()};
  double max_x{-std::numeric_limits<double>::infinity()};
  double max_y{-std::numeric_limits<double>::infinity()};

  constexpr void include(Point point) noexcept {
    min_x = std::min(min_x, point.x);
    min_y = std::min(min_y, point.y);
    max_x = std::max(max_x, point.x);
    max_y = std::max(max_y, point.y);
  }

  [[nodiscard]] constexpr bool empty() const noexcept { return min_x > max_x || min_y > max_y; }
};

struct Matrix2D {
  double a{1.0};
  double b{0.0};
  double c{0.0};
  double d{1.0};
  double e{0.0};
  double f{0.0};

  [[nodiscard]] static constexpr Matrix2D identity() noexcept { return {}; }

  [[nodiscard]] static constexpr Matrix2D translation(double x, double y) noexcept {
    return {1.0, 0.0, 0.0, 1.0, x, y};
  }

  [[nodiscard]] static constexpr Matrix2D scaling(double x, double y) noexcept {
    return {x, 0.0, 0.0, y, 0.0, 0.0};
  }

  [[nodiscard]] static Matrix2D rotation(double radians) noexcept {
    const double cos = std::cos(radians);
    const double sin = std::sin(radians);
    return {cos, sin, -sin, cos, 0.0, 0.0};
  }

  [[nodiscard]] constexpr Matrix2D operator*(const Matrix2D& rhs) const noexcept {
    return {
        a * rhs.a + c * rhs.b, b * rhs.a + d * rhs.b, a * rhs.c + c * rhs.d,
        b * rhs.c + d * rhs.d, a * rhs.e + c * rhs.f + e, b * rhs.e + d * rhs.f + f,
    };
  }

  [[nodiscard]] constexpr Point apply(Point point) const noexcept {
    return {a * point.x + c * point.y + e, b * point.x + d * point.y + f};
  }

  [[nodiscard]] constexpr double determinant() const noexcept { return a * d - b * c; }

  [[nodiscard]] constexpr std::optional<Matrix2D> inverse() const noexcept {
    const double det = determinant();
    if (det == 0.0) {
      return std::nullopt;
    }
    const double inv = 1.0 / det;
    return Matrix2D{d * inv, -b * inv, -c * inv, a * inv, (c * f - d * e) * inv, (b * e - a * f) * inv};
  }

  [[nodiscard]] double max_scale() const noexcept { return std::max(std::hypot(a, b), std::hypot(c, d)); }
};

}
