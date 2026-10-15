#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

#include "vex/geometry.hpp"

namespace vex {

enum class PathVerb : std::uint8_t { move = 0, line = 1, quadratic = 2, cubic = 3, close = 4 };

[[nodiscard]] constexpr std::size_t point_count(PathVerb verb) noexcept {
  switch (verb) {
    case PathVerb::move:
    case PathVerb::line:
      return 1;
    case PathVerb::quadratic:
      return 2;
    case PathVerb::cubic:
      return 3;
    case PathVerb::close:
      return 0;
  }
  return 0;
}

struct Path {
  std::vector<PathVerb> verbs;
  std::vector<Point> points;

  void move_to(Point point) {
    verbs.push_back(PathVerb::move);
    points.push_back(point);
  }

  void line_to(Point point) {
    verbs.push_back(PathVerb::line);
    points.push_back(point);
  }

  void quadratic_to(Point control, Point end) {
    verbs.push_back(PathVerb::quadratic);
    points.push_back(control);
    points.push_back(end);
  }

  void cubic_to(Point first, Point second, Point end) {
    verbs.push_back(PathVerb::cubic);
    points.push_back(first);
    points.push_back(second);
    points.push_back(end);
  }

  void close() { verbs.push_back(PathVerb::close); }

  [[nodiscard]] bool empty() const noexcept { return verbs.empty(); }

  [[nodiscard]] Path transformed(const Matrix2D& matrix) const {
    Path result{verbs, {}};
    result.points.reserve(points.size());
    for (const Point point : points) {
      result.points.push_back(matrix.apply(point));
    }
    return result;
  }
};

}
