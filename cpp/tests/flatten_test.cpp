#include <cmath>

#include "check.hpp"
#include "vex/flatten.hpp"

using vex::Path;
using vex::Point;
using vex::flatten;
using vex::test::near;

namespace {

Path circle_path(Point center, double radius) {
  const double k = 0.5522847498307936;
  Path path;
  path.move_to({center.x + radius, center.y});
  path.cubic_to({center.x + radius, center.y + radius * k}, {center.x + radius * k, center.y + radius},
                {center.x, center.y + radius});
  path.cubic_to({center.x - radius * k, center.y + radius}, {center.x - radius, center.y + radius * k},
                {center.x - radius, center.y});
  path.cubic_to({center.x - radius, center.y - radius * k}, {center.x - radius * k, center.y - radius},
                {center.x, center.y - radius});
  path.cubic_to({center.x + radius * k, center.y - radius}, {center.x + radius, center.y - radius * k},
                {center.x + radius, center.y});
  path.close();
  return path;
}

}

VEX_TEST(line_segments_flatten_to_single_open_polyline) {
  Path path;
  path.move_to({0.0, 0.0});
  path.line_to({10.0, 0.0});
  path.line_to({10.0, 10.0});
  const auto polylines = flatten(path, 0.1);
  VEX_EXPECT(polylines.size() == 1);
  VEX_EXPECT(polylines[0].points.size() == 3);
  VEX_EXPECT(!polylines[0].closed);
}

VEX_TEST(close_marks_polyline_closed_and_starts_new_subpath) {
  Path path;
  path.move_to({0.0, 0.0});
  path.line_to({4.0, 0.0});
  path.line_to({4.0, 4.0});
  path.close();
  path.line_to({8.0, 8.0});
  const auto polylines = flatten(path, 0.1);
  VEX_EXPECT(polylines.size() == 2);
  VEX_EXPECT(polylines[0].closed);
  VEX_EXPECT(polylines[1].points.front() == Point{0.0, 0.0});
  VEX_EXPECT(polylines[1].points.back() == Point{8.0, 8.0});
}

VEX_TEST(cubic_circle_stays_within_tolerance) {
  const double tolerance = 0.05;
  const auto polylines = flatten(circle_path({0.0, 0.0}, 50.0), tolerance);
  VEX_EXPECT(polylines.size() == 1);
  VEX_EXPECT(polylines[0].points.size() > 16);
  for (const Point point : polylines[0].points) {
    VEX_EXPECT(near(std::hypot(point.x, point.y), 50.0, 0.1));
  }
}

VEX_TEST(coarser_tolerance_produces_fewer_segments) {
  const auto fine = flatten(circle_path({0.0, 0.0}, 50.0), 0.01);
  const auto coarse = flatten(circle_path({0.0, 0.0}, 50.0), 1.0);
  VEX_EXPECT(fine[0].points.size() > coarse[0].points.size());
}

VEX_TEST(quadratic_endpoint_is_reached_exactly) {
  Path path;
  path.move_to({0.0, 0.0});
  path.quadratic_to({5.0, 10.0}, {10.0, 0.0});
  const auto polylines = flatten(path, 0.1);
  VEX_EXPECT(polylines[0].points.back() == Point{10.0, 0.0});
}

VEX_TEST(lonely_move_produces_no_polyline) {
  Path path;
  path.move_to({1.0, 1.0});
  VEX_EXPECT(flatten(path, 0.1).empty());
}
