#include "vex/stroke.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <numbers>

namespace vex {

namespace {

constexpr double kDegenerateLength = 1e-9;
constexpr std::size_t kMinCircleSegments = 8;
constexpr std::size_t kMaxCircleSegments = 256;

[[nodiscard]] std::size_t circle_segments(double radius, double tolerance) {
  if (radius <= tolerance) {
    return kMinCircleSegments;
  }
  const double step = std::acos(1.0 - tolerance / radius);
  const double estimate = std::ceil(std::numbers::pi / step);
  if (!std::isfinite(estimate)) {
    return kMaxCircleSegments;
  }
  return std::clamp<std::size_t>(static_cast<std::size_t>(estimate), kMinCircleSegments, kMaxCircleSegments);
}

void orient_positive(Polygon& polygon) {
  if (signed_area(polygon) < 0.0) {
    std::reverse(polygon.begin(), polygon.end());
  }
}

void append_segment_quad(std::vector<Polygon>& into, Point from, Point to, double half_width) {
  const Point direction = to - from;
  const double segment_length = length(direction);
  if (segment_length <= kDegenerateLength) {
    return;
  }
  const Point normal = Point{-direction.y, direction.x} * (half_width / segment_length);
  Polygon quad{from + normal, to + normal, to - normal, from - normal};
  orient_positive(quad);
  into.push_back(std::move(quad));
}

}

double signed_area(std::span<const Point> polygon) noexcept {
  double doubled = 0.0;
  for (std::size_t index = 0; index < polygon.size(); ++index) {
    doubled += cross(polygon[index], polygon[(index + 1) % polygon.size()]);
  }
  return doubled * 0.5;
}

Polygon circle_polygon(Point center, double radius, double tolerance) {
  const std::size_t segments = circle_segments(radius, tolerance);
  Polygon polygon;
  polygon.reserve(segments);
  for (std::size_t index = 0; index < segments; ++index) {
    const double angle = 2.0 * std::numbers::pi * static_cast<double>(index) / static_cast<double>(segments);
    polygon.push_back(center + Point{std::cos(angle), std::sin(angle)} * radius);
  }
  return polygon;
}

std::vector<Polygon> stroke_outline(std::span<const Polyline> polylines, double width, double tolerance) {
  std::vector<Polygon> pieces;
  const double half_width = width * 0.5;
  if (half_width <= 0.0) {
    return pieces;
  }

  for (const Polyline& polyline : polylines) {
    const std::size_t count = polyline.points.size();
    if (count == 0) {
      continue;
    }
    for (std::size_t index = 0; index + 1 < count; ++index) {
      append_segment_quad(pieces, polyline.points[index], polyline.points[index + 1], half_width);
    }
    if (polyline.closed && count >= 2) {
      append_segment_quad(pieces, polyline.points[count - 1], polyline.points[0], half_width);
    }
    for (const Point joint : polyline.points) {
      pieces.push_back(circle_polygon(joint, half_width, tolerance));
    }
  }

  return pieces;
}

}
