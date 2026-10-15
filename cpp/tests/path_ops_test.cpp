#include <cmath>
#include <numbers>
#include <vector>

#include "check.hpp"
#include "vex/c_api.h"
#include "vex/path_ops.hpp"
#include "vex/protocol.hpp"

namespace {

vex::Path unit_square() {
  vex::Path path;
  path.move_to({0.0, 0.0});
  path.line_to({10.0, 0.0});
  path.line_to({10.0, 10.0});
  path.line_to({0.0, 10.0});
  path.close();
  return path;
}

vex::Path circle_path(double radius) {
  constexpr double kappa = 0.5522847498307936;
  const double k = radius * kappa;
  vex::Path path;
  path.move_to({radius, 0.0});
  path.cubic_to({radius, k}, {k, radius}, {0.0, radius});
  path.cubic_to({-k, radius}, {-radius, k}, {-radius, 0.0});
  path.cubic_to({-radius, -k}, {-k, -radius}, {0.0, -radius});
  path.cubic_to({k, -radius}, {radius, -k}, {radius, 0.0});
  path.close();
  return path;
}

vex::Path bow_tie() {
  vex::Path path;
  path.move_to({0.0, 0.0});
  path.line_to({10.0, 10.0});
  path.line_to({10.0, 0.0});
  path.line_to({0.0, 10.0});
  path.close();
  return path;
}

}

VEX_TEST(path_ops_measures_polygon_length_and_bounds) {
  const vex::PathMeasure measure = vex::measure_path(unit_square());
  VEX_EXPECT(vex::test::near(measure.length, 40.0));
  VEX_EXPECT(vex::test::near(measure.exact_bounds.min_x, 0.0));
  VEX_EXPECT(vex::test::near(measure.exact_bounds.max_y, 10.0));
  VEX_EXPECT(measure.subpath_count == 1);
  VEX_EXPECT(measure.degenerate_subpaths == 0);
  VEX_EXPECT(measure.self_intersections == 0);
  VEX_EXPECT(measure.all_closed);
}

VEX_TEST(path_ops_measures_curves_precisely) {
  const vex::Path circle = circle_path(10.0);
  const double expected = 2.0 * std::numbers::pi * 10.0;
  VEX_EXPECT(std::abs(vex::path_length(circle, 1e-4) - expected) < 0.05);

  const vex::Bounds control = vex::control_bounds(circle);
  const vex::Bounds exact = vex::exact_bounds(circle);
  VEX_EXPECT(vex::test::near(control.max_x, 10.0));
  VEX_EXPECT(std::abs(exact.max_x - 10.0) < 1e-9);
  VEX_EXPECT(std::abs(exact.min_y + 10.0) < 1e-9);

  vex::Path bulge;
  bulge.move_to({0.0, 0.0});
  bulge.quadratic_to({5.0, 20.0}, {10.0, 0.0});
  const vex::Bounds bulge_bounds = vex::exact_bounds(bulge);
  VEX_EXPECT(vex::test::near(bulge_bounds.max_y, 10.0));
  VEX_EXPECT(vex::test::near(vex::control_bounds(bulge).max_y, 20.0));
}

VEX_TEST(path_ops_counts_subpaths_degenerates_and_intersections) {
  vex::Path path = unit_square();
  path.move_to({50.0, 50.0});
  path.move_to({60.0, 60.0});
  path.line_to({60.0, 60.0});
  path.close();
  VEX_EXPECT(vex::subpath_count(path) == 3);
  VEX_EXPECT(vex::degenerate_subpath_count(path) == 2);
  VEX_EXPECT(!vex::measure_path(path).all_closed);

  VEX_EXPECT(vex::self_intersection_count(bow_tie()) == 1);
  VEX_EXPECT(vex::self_intersection_count(circle_path(5.0)) == 0);

  vex::Path star;
  const double radius = 10.0;
  for (int index = 0; index < 5; ++index) {
    const double angle = static_cast<double>(index) * 4.0 * std::numbers::pi / 5.0 - std::numbers::pi / 2.0;
    const vex::Point point{radius * std::cos(angle), radius * std::sin(angle)};
    if (index == 0) {
      star.move_to(point);
    } else {
      star.line_to(point);
    }
  }
  star.close();
  VEX_EXPECT(vex::self_intersection_count(star) == 5);
}

VEX_TEST(path_ops_reverses_and_closes_paths) {
  vex::Path open;
  open.move_to({0.0, 0.0});
  open.quadratic_to({5.0, 5.0}, {10.0, 0.0});
  open.cubic_to({12.0, 2.0}, {14.0, 4.0}, {16.0, 0.0});

  const vex::Path reversed = vex::reverse_path(open);
  VEX_EXPECT(reversed.verbs.size() == 3);
  VEX_EXPECT(reversed.verbs[0] == vex::PathVerb::move);
  VEX_EXPECT(reversed.verbs[1] == vex::PathVerb::cubic);
  VEX_EXPECT(reversed.verbs[2] == vex::PathVerb::quadratic);
  VEX_EXPECT(reversed.points.front() == vex::Point{16.0, 0.0});
  VEX_EXPECT(reversed.points[1] == vex::Point{14.0, 4.0});
  VEX_EXPECT(reversed.points[2] == vex::Point{12.0, 2.0});
  VEX_EXPECT(reversed.points.back() == vex::Point{0.0, 0.0});
  VEX_EXPECT(vex::test::near(vex::path_length(reversed), vex::path_length(open), 1e-6));
  VEX_EXPECT(vex::reverse_path(reversed).points == open.points);

  const vex::Path closed = vex::close_subpaths(open);
  VEX_EXPECT(closed.verbs.back() == vex::PathVerb::close);
  VEX_EXPECT(vex::measure_path(closed).all_closed);
  VEX_EXPECT(vex::test::near(vex::path_length(closed), vex::path_length(open) + 16.0, 1e-6));

  const vex::Path square_reversed = vex::reverse_path(unit_square());
  VEX_EXPECT(square_reversed.verbs.back() == vex::PathVerb::close);
  VEX_EXPECT(square_reversed.points.front() == vex::Point{0.0, 10.0});
  VEX_EXPECT(vex::test::near(vex::path_length(square_reversed), 40.0));
}

VEX_TEST(path_ops_simplifies_polylines) {
  std::vector<vex::Point> noisy;
  for (int index = 0; index <= 100; ++index) {
    const double x = static_cast<double>(index);
    noisy.push_back({x, (index % 2 == 0) ? 0.05 : -0.05});
  }
  const std::vector<vex::Point> simplified = vex::simplify_polyline(noisy, 0.2, false);
  VEX_EXPECT(simplified.size() == 2);
  VEX_EXPECT(simplified.front() == noisy.front());
  VEX_EXPECT(simplified.back() == noisy.back());

  const std::vector<vex::Point> kept = vex::simplify_polyline(noisy, 0.01, false);
  VEX_EXPECT(kept.size() == noisy.size());

  std::vector<vex::Point> ring;
  for (int index = 0; index < 360; ++index) {
    const double angle = static_cast<double>(index) * std::numbers::pi / 180.0;
    ring.push_back({100.0 * std::cos(angle), 100.0 * std::sin(angle)});
  }
  const std::vector<vex::Point> ring_simplified = vex::simplify_polyline(ring, 0.5, true);
  VEX_EXPECT(ring_simplified.size() < ring.size());
  VEX_EXPECT(ring_simplified.size() > 8);
}

VEX_TEST(path_ops_simplifies_paths_into_polylines) {
  const vex::Path simplified = vex::simplify_path(circle_path(20.0), 0.5);
  VEX_EXPECT(simplified.verbs.front() == vex::PathVerb::move);
  VEX_EXPECT(simplified.verbs.back() == vex::PathVerb::close);
  VEX_EXPECT(std::abs(vex::path_length(simplified) - 2.0 * std::numbers::pi * 20.0) < 2.0);
  for (const vex::PathVerb verb : simplified.verbs) {
    VEX_EXPECT(verb != vex::PathVerb::quadratic && verb != vex::PathVerb::cubic);
  }
}

VEX_TEST(path_ops_finds_points_along_paths) {
  const auto start = vex::point_at_length(unit_square(), 0.0);
  const auto middle = vex::point_at_length(unit_square(), 15.0);
  const auto end = vex::point_at_length(unit_square(), 40.0);
  VEX_EXPECT(start.has_value() && *start == vex::Point{0.0, 0.0});
  VEX_EXPECT(middle.has_value() && vex::test::near(middle->x, 10.0) && vex::test::near(middle->y, 5.0));
  VEX_EXPECT(end.has_value() && vex::test::near(end->x, 0.0, 1e-9) && vex::test::near(end->y, 0.0, 1e-9));
  VEX_EXPECT(!vex::point_at_length(unit_square(), 41.0).has_value());
  VEX_EXPECT(!vex::point_at_length(unit_square(), -1.0).has_value());
  VEX_EXPECT(!vex::point_at_length(vex::Path{}, 0.0).has_value());
}

VEX_TEST(path_ops_roundtrips_the_path_encoding) {
  const vex::Path original = circle_path(3.0);
  const std::vector<double> encoded = vex::encode_path(original);
  const auto decoded = vex::decode_path(encoded);
  VEX_EXPECT(decoded.has_value());
  VEX_EXPECT(decoded->verbs == original.verbs);
  VEX_EXPECT(decoded->points == original.points);

  std::vector<double> trailing = encoded;
  trailing.push_back(1.0);
  VEX_EXPECT(!vex::decode_path(trailing).has_value());
  VEX_EXPECT(vex::decode_path(std::vector<double>{1.0, 9.0}).error() == vex::DecodeError::invalid_verb);
  VEX_EXPECT(vex::decode_path(std::vector<double>{2.0, 0.0, 1.0}).error() == vex::DecodeError::truncated_buffer);
}

VEX_TEST(c_api_measures_and_simplifies_paths) {
  const std::vector<double> encoded = vex::encode_path(bow_tie());
  double measure[VEX_PATH_MEASURE_LENGTH];
  VEX_EXPECT(vex_path_measure(encoded.data(), encoded.size(), 0.01, measure, VEX_PATH_MEASURE_LENGTH) ==
             VEX_STATUS_OK);
  VEX_EXPECT(vex::test::near(measure[0], 20.0 + 2.0 * std::hypot(10.0, 10.0), 1e-9));
  VEX_EXPECT(vex::test::near(measure[3], 10.0));
  VEX_EXPECT(vex::test::near(measure[9], 1.0));
  VEX_EXPECT(vex::test::near(measure[11], 1.0));
  VEX_EXPECT(vex::test::near(measure[12], 1.0));

  VEX_EXPECT(vex_path_measure(encoded.data(), encoded.size(), 0.01, measure, 2) == VEX_STATUS_BUFFER_TOO_SMALL);
  VEX_EXPECT(vex_path_measure(encoded.data(), encoded.size(), -1.0, measure, VEX_PATH_MEASURE_LENGTH) ==
             VEX_STATUS_INVALID_VALUE);
  VEX_EXPECT(vex_path_measure(nullptr, 3, 0.01, measure, VEX_PATH_MEASURE_LENGTH) == VEX_STATUS_INVALID_VALUE);
  const double invalid[] = {1.0, 7.0};
  VEX_EXPECT(vex_path_measure(invalid, 2, 0.01, measure, VEX_PATH_MEASURE_LENGTH) == VEX_STATUS_INVALID_VERB);

  const std::vector<double> circle = vex::encode_path(circle_path(20.0));
  size_t required = 0;
  VEX_EXPECT(vex_path_simplify(circle.data(), circle.size(), 0.5, nullptr, 0, &required) ==
             VEX_STATUS_BUFFER_TOO_SMALL);
  VEX_EXPECT(required > 0);
  std::vector<double> output(required);
  VEX_EXPECT(vex_path_simplify(circle.data(), circle.size(), 0.5, output.data(), output.size(), &required) ==
             VEX_STATUS_OK);
  const auto simplified = vex::decode_path(output);
  VEX_EXPECT(simplified.has_value());
  VEX_EXPECT(simplified->verbs.back() == vex::PathVerb::close);
}
