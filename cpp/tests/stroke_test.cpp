#include "check.hpp"
#include "vex/stroke.hpp"

using vex::Point;
using vex::Polyline;
using vex::signed_area;
using vex::stroke_outline;
using vex::test::near;

VEX_TEST(signed_area_is_positive_for_counter_clockwise_polygons) {
  const std::vector<Point> square{{0.0, 0.0}, {2.0, 0.0}, {2.0, 2.0}, {0.0, 2.0}};
  VEX_EXPECT(near(signed_area(square), 4.0));
}

VEX_TEST(stroke_of_single_segment_yields_quad_and_two_round_caps) {
  const Polyline polyline{{{0.0, 0.0}, {10.0, 0.0}}, false};
  const auto pieces = stroke_outline(std::span(&polyline, 1), 2.0, 0.1);
  VEX_EXPECT(pieces.size() == 3);
  VEX_EXPECT(pieces[0].size() == 4);
  for (const auto& piece : pieces) {
    VEX_EXPECT(signed_area(piece) > 0.0);
  }
}

VEX_TEST(closed_polyline_adds_closing_segment) {
  const Polyline open{{{0.0, 0.0}, {10.0, 0.0}, {10.0, 10.0}}, false};
  const Polyline closed{{{0.0, 0.0}, {10.0, 0.0}, {10.0, 10.0}}, true};
  VEX_EXPECT(stroke_outline(std::span(&closed, 1), 2.0, 0.1).size() ==
             stroke_outline(std::span(&open, 1), 2.0, 0.1).size() + 1);
}

VEX_TEST(zero_width_stroke_has_no_outline) {
  const Polyline polyline{{{0.0, 0.0}, {10.0, 0.0}}, false};
  VEX_EXPECT(stroke_outline(std::span(&polyline, 1), 0.0, 0.1).empty());
}

VEX_TEST(circle_polygon_segments_scale_with_radius) {
  VEX_EXPECT(vex::circle_polygon({0.0, 0.0}, 1.0, 0.1).size() < vex::circle_polygon({0.0, 0.0}, 100.0, 0.1).size());
}
