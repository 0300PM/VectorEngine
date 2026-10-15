#pragma once

#include <cstddef>
#include <optional>
#include <span>
#include <vector>

#include "vex/geometry.hpp"
#include "vex/path.hpp"

namespace vex {

inline constexpr double kDefaultMeasureTolerance = 0.01;
inline constexpr std::size_t kPathMeasureLength = 13;

struct PathMeasure {
  double length{};
  Bounds control_bounds{};
  Bounds exact_bounds{};
  std::size_t subpath_count{};
  std::size_t degenerate_subpaths{};
  std::size_t self_intersections{};
  bool all_closed{};
};

[[nodiscard]] std::vector<Path> split_subpaths(const Path& path);
[[nodiscard]] Bounds control_bounds(const Path& path);
[[nodiscard]] Bounds exact_bounds(const Path& path);
[[nodiscard]] double path_length(const Path& path, double tolerance = kDefaultMeasureTolerance);
[[nodiscard]] std::size_t subpath_count(const Path& path);
[[nodiscard]] std::size_t degenerate_subpath_count(const Path& path);
[[nodiscard]] std::size_t self_intersection_count(const Path& path,
                                                  double tolerance = kDefaultMeasureTolerance);
[[nodiscard]] PathMeasure measure_path(const Path& path, double tolerance = kDefaultMeasureTolerance);
[[nodiscard]] std::optional<Point> point_at_length(const Path& path, double distance,
                                                   double tolerance = kDefaultMeasureTolerance);
[[nodiscard]] Path reverse_path(const Path& path);
[[nodiscard]] Path close_subpaths(const Path& path);
[[nodiscard]] std::vector<Point> simplify_polyline(std::span<const Point> points, double tolerance,
                                                   bool closed);
[[nodiscard]] Path simplify_path(const Path& path, double tolerance);
[[nodiscard]] std::vector<double> encode_measure(const PathMeasure& measure);

}
