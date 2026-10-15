#pragma once

#include <span>
#include <vector>

#include "vex/flatten.hpp"
#include "vex/geometry.hpp"

namespace vex {

using Polygon = std::vector<Point>;

[[nodiscard]] double signed_area(std::span<const Point> polygon) noexcept;

[[nodiscard]] Polygon circle_polygon(Point center, double radius, double tolerance);

[[nodiscard]] std::vector<Polygon> stroke_outline(std::span<const Polyline> polylines, double width,
                                                  double tolerance);

}
