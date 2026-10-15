#include "vex/flatten.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>

namespace vex {

namespace {

constexpr std::size_t kMaxSegments = 256;

[[nodiscard]] std::size_t segment_count(double second_difference, double factor, double tolerance) {
  const double estimate = std::sqrt(factor * second_difference / tolerance);
  if (!std::isfinite(estimate)) {
    return kMaxSegments;
  }
  return std::clamp<std::size_t>(static_cast<std::size_t>(std::ceil(estimate)), 1, kMaxSegments);
}

[[nodiscard]] Point quadratic_at(Point p0, Point p1, Point p2, double t) {
  const double u = 1.0 - t;
  return p0 * (u * u) + p1 * (2.0 * u * t) + p2 * (t * t);
}

[[nodiscard]] Point cubic_at(Point p0, Point p1, Point p2, Point p3, double t) {
  const double u = 1.0 - t;
  return p0 * (u * u * u) + p1 * (3.0 * u * u * t) + p2 * (3.0 * u * t * t) + p3 * (t * t * t);
}

class Flattener {
 public:
  explicit Flattener(double tolerance) : tolerance_(std::max(tolerance, 1e-6)) {}

  void move_to(Point point) {
    finish_current(false);
    subpath_start_ = point;
    current_.points.push_back(point);
  }

  void line_to(Point point) {
    ensure_started();
    current_.points.push_back(point);
  }

  void quadratic_to(Point control, Point end) {
    ensure_started();
    const Point start = current_.points.back();
    const double deviation = length(start - control * 2.0 + end);
    emit_curve(segment_count(deviation, 0.125, tolerance_),
               [&](double t) { return quadratic_at(start, control, end, t); });
  }

  void cubic_to(Point first, Point second, Point end) {
    ensure_started();
    const Point start = current_.points.back();
    const double deviation =
        std::max(length(start - first * 2.0 + second), length(first - second * 2.0 + end));
    emit_curve(segment_count(deviation, 0.75, tolerance_),
               [&](double t) { return cubic_at(start, first, second, end, t); });
  }

  void close() {
    if (current_.points.empty()) {
      return;
    }
    finish_current(true);
    current_.points.push_back(subpath_start_);
  }

  [[nodiscard]] std::vector<Polyline> finish() {
    finish_current(false);
    return std::move(result_);
  }

 private:
  double tolerance_;
  Point subpath_start_{};
  Polyline current_{};
  std::vector<Polyline> result_{};

  void ensure_started() {
    if (current_.points.empty()) {
      current_.points.push_back(subpath_start_);
    }
  }

  template <typename Evaluate>
  void emit_curve(std::size_t segments, Evaluate evaluate) {
    for (std::size_t index = 1; index <= segments; ++index) {
      current_.points.push_back(evaluate(static_cast<double>(index) / static_cast<double>(segments)));
    }
  }

  void finish_current(bool closed) {
    if (current_.points.size() >= 2) {
      current_.closed = closed;
      result_.push_back(std::move(current_));
    }
    current_ = Polyline{};
  }
};

}

std::vector<Polyline> flatten(const Path& path, double tolerance) {
  Flattener flattener(tolerance);
  std::size_t cursor = 0;
  for (const PathVerb verb : path.verbs) {
    if (cursor + point_count(verb) > path.points.size()) {
      break;
    }
    switch (verb) {
      case PathVerb::move:
        flattener.move_to(path.points[cursor]);
        break;
      case PathVerb::line:
        flattener.line_to(path.points[cursor]);
        break;
      case PathVerb::quadratic:
        flattener.quadratic_to(path.points[cursor], path.points[cursor + 1]);
        break;
      case PathVerb::cubic:
        flattener.cubic_to(path.points[cursor], path.points[cursor + 1], path.points[cursor + 2]);
        break;
      case PathVerb::close:
        flattener.close();
        break;
    }
    cursor += point_count(verb);
  }
  return flattener.finish();
}

}
