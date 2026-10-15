#include "vex/path_ops.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <numeric>
#include <utility>

#include "vex/flatten.hpp"

namespace vex {

namespace {

constexpr int kMaxSubdivisionDepth = 18;
constexpr double kEpsilon = 1e-12;

struct Segment {
  PathVerb verb{PathVerb::line};
  Point from{};
  Point control1{};
  Point control2{};
  Point to{};
};

struct Subpath {
  Point start{};
  std::vector<Segment> segments;
  bool closed{false};
};

[[nodiscard]] std::vector<Subpath> collect_subpaths(const Path& path) {
  std::vector<Subpath> subpaths;
  Subpath current;
  Point position{};
  bool active = false;
  std::size_t cursor = 0;

  auto flush = [&](bool closed) {
    if (active) {
      current.closed = closed;
      subpaths.push_back(std::move(current));
      current = Subpath{};
      active = false;
    }
  };
  auto ensure_active = [&]() {
    if (!active) {
      current.start = position;
      active = true;
    }
  };

  for (const PathVerb verb : path.verbs) {
    if (cursor + point_count(verb) > path.points.size()) {
      break;
    }
    switch (verb) {
      case PathVerb::move:
        flush(false);
        position = path.points[cursor];
        current.start = position;
        active = true;
        break;
      case PathVerb::line:
        ensure_active();
        current.segments.push_back({verb, position, {}, {}, path.points[cursor]});
        position = path.points[cursor];
        break;
      case PathVerb::quadratic:
        ensure_active();
        current.segments.push_back({verb, position, path.points[cursor], {}, path.points[cursor + 1]});
        position = path.points[cursor + 1];
        break;
      case PathVerb::cubic:
        ensure_active();
        current.segments.push_back(
            {verb, position, path.points[cursor], path.points[cursor + 1], path.points[cursor + 2]});
        position = path.points[cursor + 2];
        break;
      case PathVerb::close: {
        const Point start = current.start;
        flush(true);
        position = start;
        break;
      }
    }
    cursor += point_count(verb);
  }
  flush(false);
  return subpaths;
}

[[nodiscard]] Path subpath_to_path(const Subpath& subpath) {
  Path path;
  path.move_to(subpath.start);
  for (const Segment& segment : subpath.segments) {
    switch (segment.verb) {
      case PathVerb::line:
        path.line_to(segment.to);
        break;
      case PathVerb::quadratic:
        path.quadratic_to(segment.control1, segment.to);
        break;
      case PathVerb::cubic:
        path.cubic_to(segment.control1, segment.control2, segment.to);
        break;
      case PathVerb::move:
      case PathVerb::close:
        break;
    }
  }
  if (subpath.closed) {
    path.close();
  }
  return path;
}

[[nodiscard]] std::array<Point, 4> as_cubic(const Segment& segment) {
  switch (segment.verb) {
    case PathVerb::quadratic:
      return {segment.from, lerp(segment.from, segment.control1, 2.0 / 3.0),
              lerp(segment.to, segment.control1, 2.0 / 3.0), segment.to};
    case PathVerb::cubic:
      return {segment.from, segment.control1, segment.control2, segment.to};
    case PathVerb::move:
    case PathVerb::line:
    case PathVerb::close:
      return {segment.from, lerp(segment.from, segment.to, 1.0 / 3.0), lerp(segment.from, segment.to, 2.0 / 3.0),
              segment.to};
  }
  return {segment.from, segment.from, segment.to, segment.to};
}

[[nodiscard]] double cubic_length(const std::array<Point, 4>& cubic, double tolerance, int depth) {
  const double chord = length(cubic[3] - cubic[0]);
  const double polygon =
      length(cubic[1] - cubic[0]) + length(cubic[2] - cubic[1]) + length(cubic[3] - cubic[2]);
  if (polygon - chord <= tolerance || depth >= kMaxSubdivisionDepth) {
    return (polygon + chord) * 0.5;
  }
  const Point p01 = lerp(cubic[0], cubic[1], 0.5);
  const Point p12 = lerp(cubic[1], cubic[2], 0.5);
  const Point p23 = lerp(cubic[2], cubic[3], 0.5);
  const Point p012 = lerp(p01, p12, 0.5);
  const Point p123 = lerp(p12, p23, 0.5);
  const Point middle = lerp(p012, p123, 0.5);
  const double half_tolerance = tolerance * 0.5;
  return cubic_length({cubic[0], p01, p012, middle}, half_tolerance, depth + 1) +
         cubic_length({middle, p123, p23, cubic[3]}, half_tolerance, depth + 1);
}

[[nodiscard]] double segment_length(const Segment& segment, double tolerance) {
  if (segment.verb == PathVerb::line) {
    return length(segment.to - segment.from);
  }
  return cubic_length(as_cubic(segment), tolerance, 0);
}

[[nodiscard]] Point cubic_at(const std::array<Point, 4>& cubic, double t) {
  const double u = 1.0 - t;
  return cubic[0] * (u * u * u) + cubic[1] * (3.0 * u * u * t) + cubic[2] * (3.0 * u * t * t) +
         cubic[3] * (t * t * t);
}

void include_axis_extrema(Bounds& bounds, const std::array<Point, 4>& cubic) {
  const auto roots_for = [](double p0, double p1, double p2, double p3, std::array<double, 2>& roots) {
    const double a = -p0 + 3.0 * p1 - 3.0 * p2 + p3;
    const double b = 2.0 * (p0 - 2.0 * p1 + p2);
    const double c = p1 - p0;
    std::size_t count = 0;
    if (std::abs(a) < kEpsilon) {
      if (std::abs(b) > kEpsilon) {
        roots[count++] = -c / b;
      }
      return count;
    }
    const double discriminant = b * b - 4.0 * a * c;
    if (discriminant < 0.0) {
      return count;
    }
    const double root = std::sqrt(discriminant);
    roots[count++] = (-b + root) / (2.0 * a);
    roots[count++] = (-b - root) / (2.0 * a);
    return count;
  };
  std::array<double, 2> roots{};
  const std::size_t x_count = roots_for(cubic[0].x, cubic[1].x, cubic[2].x, cubic[3].x, roots);
  for (std::size_t index = 0; index < x_count; ++index) {
    if (roots[index] > 0.0 && roots[index] < 1.0) {
      bounds.include(cubic_at(cubic, roots[index]));
    }
  }
  const std::size_t y_count = roots_for(cubic[0].y, cubic[1].y, cubic[2].y, cubic[3].y, roots);
  for (std::size_t index = 0; index < y_count; ++index) {
    if (roots[index] > 0.0 && roots[index] < 1.0) {
      bounds.include(cubic_at(cubic, roots[index]));
    }
  }
}

[[nodiscard]] double point_segment_distance(Point point, Point from, Point to) {
  const Point direction = to - from;
  const double squared = dot(direction, direction);
  if (squared < kEpsilon) {
    return length(point - from);
  }
  const double t = std::clamp(dot(point - from, direction) / squared, 0.0, 1.0);
  return length(point - (from + direction * t));
}

void douglas_peucker(std::span<const Point> points, std::size_t first, std::size_t last, double tolerance,
                     std::vector<bool>& keep) {
  std::vector<std::pair<std::size_t, std::size_t>> stack{{first, last}};
  while (!stack.empty()) {
    const auto [start, end] = stack.back();
    stack.pop_back();
    if (end <= start + 1) {
      continue;
    }
    double farthest = -1.0;
    std::size_t pivot = start;
    for (std::size_t index = start + 1; index < end; ++index) {
      const double distance = point_segment_distance(points[index], points[start], points[end]);
      if (distance > farthest) {
        farthest = distance;
        pivot = index;
      }
    }
    if (farthest > tolerance) {
      keep[pivot] = true;
      stack.emplace_back(start, pivot);
      stack.emplace_back(pivot, end);
    }
  }
}

struct FlatSegment {
  Point from{};
  Point to{};
  std::size_t polyline{};
  std::size_t index{};
  std::size_t count{};
  bool closed{};
  double min_x{};
  double max_x{};
  double min_y{};
  double max_y{};
};

[[nodiscard]] int orientation(Point a, Point b, Point c) {
  const double value = cross(b - a, c - a);
  if (std::abs(value) < kEpsilon) {
    return 0;
  }
  return value > 0.0 ? 1 : -1;
}

[[nodiscard]] bool segments_cross(const FlatSegment& lhs, const FlatSegment& rhs) {
  const int o1 = orientation(lhs.from, lhs.to, rhs.from);
  const int o2 = orientation(lhs.from, lhs.to, rhs.to);
  const int o3 = orientation(rhs.from, rhs.to, lhs.from);
  const int o4 = orientation(rhs.from, rhs.to, lhs.to);
  return o1 != 0 && o2 != 0 && o3 != 0 && o4 != 0 && o1 != o2 && o3 != o4;
}

[[nodiscard]] bool adjacent(const FlatSegment& lhs, const FlatSegment& rhs) {
  if (lhs.polyline != rhs.polyline) {
    return false;
  }
  const std::size_t low = std::min(lhs.index, rhs.index);
  const std::size_t high = std::max(lhs.index, rhs.index);
  if (high == low + 1) {
    return true;
  }
  return lhs.closed && low == 0 && high == lhs.count - 1;
}

[[nodiscard]] std::vector<FlatSegment> flat_segments(const std::vector<Polyline>& polylines) {
  std::vector<FlatSegment> segments;
  for (std::size_t polyline_index = 0; polyline_index < polylines.size(); ++polyline_index) {
    const Polyline& polyline = polylines[polyline_index];
    const std::size_t count = polyline.points.size() - (polyline.closed ? 0 : 1);
    for (std::size_t index = 0; index < count; ++index) {
      const Point from = polyline.points[index];
      const Point to = polyline.points[(index + 1) % polyline.points.size()];
      if (from == to) {
        continue;
      }
      segments.push_back({from, to, polyline_index, index, count, polyline.closed, std::min(from.x, to.x),
                          std::max(from.x, to.x), std::min(from.y, to.y), std::max(from.y, to.y)});
    }
  }
  return segments;
}

}

std::vector<Path> split_subpaths(const Path& path) {
  std::vector<Path> result;
  for (const Subpath& subpath : collect_subpaths(path)) {
    result.push_back(subpath_to_path(subpath));
  }
  return result;
}

Bounds control_bounds(const Path& path) {
  Bounds bounds;
  for (const Point point : path.points) {
    bounds.include(point);
  }
  return bounds;
}

Bounds exact_bounds(const Path& path) {
  Bounds bounds;
  for (const Subpath& subpath : collect_subpaths(path)) {
    bounds.include(subpath.start);
    for (const Segment& segment : subpath.segments) {
      bounds.include(segment.to);
      if (segment.verb != PathVerb::line) {
        include_axis_extrema(bounds, as_cubic(segment));
      }
    }
  }
  return bounds;
}

double path_length(const Path& path, double tolerance) {
  const double clamped = std::max(tolerance, 1e-9);
  double total = 0.0;
  for (const Subpath& subpath : collect_subpaths(path)) {
    Point position = subpath.start;
    for (const Segment& segment : subpath.segments) {
      total += segment_length(segment, clamped);
      position = segment.to;
    }
    if (subpath.closed) {
      total += length(subpath.start - position);
    }
  }
  return total;
}

std::size_t subpath_count(const Path& path) { return collect_subpaths(path).size(); }

std::size_t degenerate_subpath_count(const Path& path) {
  std::size_t count = 0;
  for (const Subpath& subpath : collect_subpaths(path)) {
    const bool degenerate = std::all_of(subpath.segments.begin(), subpath.segments.end(), [&](const Segment& segment) {
      const Point start = subpath.start;
      switch (segment.verb) {
        case PathVerb::quadratic:
          return segment.to == start && segment.control1 == start;
        case PathVerb::cubic:
          return segment.to == start && segment.control1 == start && segment.control2 == start;
        case PathVerb::move:
        case PathVerb::line:
        case PathVerb::close:
          return segment.to == start;
      }
      return false;
    });
    if (degenerate) {
      ++count;
    }
  }
  return count;
}

std::size_t self_intersection_count(const Path& path, double tolerance) {
  std::vector<FlatSegment> segments = flat_segments(flatten(path, std::max(tolerance, 1e-6)));
  std::sort(segments.begin(), segments.end(),
            [](const FlatSegment& lhs, const FlatSegment& rhs) { return lhs.min_x < rhs.min_x; });
  std::size_t count = 0;
  for (std::size_t index = 0; index < segments.size(); ++index) {
    const FlatSegment& current = segments[index];
    for (std::size_t other = index + 1; other < segments.size(); ++other) {
      const FlatSegment& candidate = segments[other];
      if (candidate.min_x > current.max_x) {
        break;
      }
      if (candidate.max_y < current.min_y || candidate.min_y > current.max_y || adjacent(current, candidate)) {
        continue;
      }
      if (segments_cross(current, candidate)) {
        ++count;
      }
    }
  }
  return count;
}

PathMeasure measure_path(const Path& path, double tolerance) {
  const std::vector<Subpath> subpaths = collect_subpaths(path);
  PathMeasure measure;
  measure.length = path_length(path, tolerance);
  measure.control_bounds = control_bounds(path);
  measure.exact_bounds = exact_bounds(path);
  measure.subpath_count = subpaths.size();
  measure.degenerate_subpaths = degenerate_subpath_count(path);
  measure.self_intersections = self_intersection_count(path, tolerance);
  measure.all_closed = !subpaths.empty() &&
                       std::all_of(subpaths.begin(), subpaths.end(), [](const Subpath& subpath) { return subpath.closed; });
  return measure;
}

std::optional<Point> point_at_length(const Path& path, double distance, double tolerance) {
  if (!(distance >= 0.0)) {
    return std::nullopt;
  }
  double remaining = distance;
  for (const Polyline& polyline : flatten(path, std::max(tolerance, 1e-6))) {
    const std::size_t count = polyline.points.size() - (polyline.closed ? 0 : 1);
    for (std::size_t index = 0; index < count; ++index) {
      const Point from = polyline.points[index];
      const Point to = polyline.points[(index + 1) % polyline.points.size()];
      const double segment = length(to - from);
      if (remaining <= segment) {
        return segment < kEpsilon ? from : lerp(from, to, remaining / segment);
      }
      remaining -= segment;
    }
  }
  return std::nullopt;
}

Path reverse_path(const Path& path) {
  Path result;
  for (const Subpath& subpath : collect_subpaths(path)) {
    const Point end = subpath.segments.empty() ? subpath.start : subpath.segments.back().to;
    result.move_to(end);
    for (auto it = subpath.segments.rbegin(); it != subpath.segments.rend(); ++it) {
      switch (it->verb) {
        case PathVerb::line:
          result.line_to(it->from);
          break;
        case PathVerb::quadratic:
          result.quadratic_to(it->control1, it->from);
          break;
        case PathVerb::cubic:
          result.cubic_to(it->control2, it->control1, it->from);
          break;
        case PathVerb::move:
        case PathVerb::close:
          break;
      }
    }
    if (subpath.closed) {
      result.close();
    }
  }
  return result;
}

Path close_subpaths(const Path& path) {
  Path result;
  for (Subpath subpath : collect_subpaths(path)) {
    subpath.closed = true;
    const Path converted = subpath_to_path(subpath);
    result.verbs.insert(result.verbs.end(), converted.verbs.begin(), converted.verbs.end());
    result.points.insert(result.points.end(), converted.points.begin(), converted.points.end());
  }
  return result;
}

std::vector<Point> simplify_polyline(std::span<const Point> points, double tolerance, bool closed) {
  if (points.size() < 3) {
    return {points.begin(), points.end()};
  }
  const double clamped = std::max(tolerance, 0.0);
  std::vector<Point> ring;
  std::size_t pivot = 0;
  if (closed) {
    ring.assign(points.begin(), points.end());
    ring.push_back(points.front());
    double farthest = -1.0;
    for (std::size_t index = 1; index < points.size(); ++index) {
      const double distance = length(points[index] - points.front());
      if (distance > farthest) {
        farthest = distance;
        pivot = index;
      }
    }
    points = ring;
  }
  std::vector<bool> keep(points.size(), false);
  keep.front() = true;
  keep.back() = true;
  if (closed) {
    keep[pivot] = true;
    douglas_peucker(points, 0, pivot, clamped, keep);
    douglas_peucker(points, pivot, points.size() - 1, clamped, keep);
  } else {
    douglas_peucker(points, 0, points.size() - 1, clamped, keep);
  }
  std::vector<Point> result;
  for (std::size_t index = 0; index < points.size(); ++index) {
    if (keep[index]) {
      result.push_back(points[index]);
    }
  }
  if (closed) {
    result.pop_back();
  }
  return result;
}

Path simplify_path(const Path& path, double tolerance) {
  Path result;
  for (const Polyline& polyline : flatten(path, std::max(tolerance, 1e-6))) {
    const std::vector<Point> simplified = simplify_polyline(polyline.points, tolerance, polyline.closed);
    if (simplified.empty()) {
      continue;
    }
    result.move_to(simplified.front());
    for (std::size_t index = 1; index < simplified.size(); ++index) {
      result.line_to(simplified[index]);
    }
    if (polyline.closed) {
      result.close();
    }
  }
  return result;
}

std::vector<double> encode_measure(const PathMeasure& measure) {
  const auto bounds_values = [](const Bounds& bounds) {
    return bounds.empty() ? std::array<double, 4>{0.0, 0.0, 0.0, 0.0}
                          : std::array<double, 4>{bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y};
  };
  const auto control = bounds_values(measure.control_bounds);
  const auto exact = bounds_values(measure.exact_bounds);
  return {measure.length,
          control[0],
          control[1],
          control[2],
          control[3],
          exact[0],
          exact[1],
          exact[2],
          exact[3],
          static_cast<double>(measure.subpath_count),
          static_cast<double>(measure.degenerate_subpaths),
          static_cast<double>(measure.self_intersections),
          measure.all_closed ? 1.0 : 0.0};
}

}
