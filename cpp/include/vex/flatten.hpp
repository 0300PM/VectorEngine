#pragma once

#include <vector>

#include "vex/geometry.hpp"
#include "vex/path.hpp"

namespace vex {

struct Polyline {
  std::vector<Point> points;
  bool closed{false};
};

inline constexpr double kDefaultFlattenTolerance = 0.2;

[[nodiscard]] std::vector<Polyline> flatten(const Path& path, double tolerance);

}
