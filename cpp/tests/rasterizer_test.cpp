#include <vector>

#include "check.hpp"
#include "vex/rasterizer.hpp"

using vex::Point;
using vex::Polygon;
using vex::Rasterizer;
using vex::Rgba;
using vex::test::near;

namespace {

Polygon square(double x0, double y0, double x1, double y1) {
  return {{x0, y0}, {x1, y0}, {x1, y1}, {x0, y1}};
}

constexpr Rgba kRed{1.0f, 0.0f, 0.0f, 1.0f};
constexpr Rgba kWhite{1.0f, 1.0f, 1.0f, 1.0f};

}

VEX_TEST(clear_fills_every_pixel) {
  Rasterizer rasterizer(3, 2);
  rasterizer.clear({0.0f, 0.5f, 1.0f, 1.0f});
  const Rgba pixel = rasterizer.pixel_at(2, 1);
  VEX_EXPECT(near(pixel.g, 0.5, 0.01));
  VEX_EXPECT(near(pixel.b, 1.0, 0.01));
  VEX_EXPECT(rasterizer.pixels().size() == 3 * 2 * 4);
}

VEX_TEST(axis_aligned_square_covers_interior_only) {
  Rasterizer rasterizer(12, 12);
  rasterizer.clear(kWhite);
  const std::vector<Polygon> polygons{square(2.0, 2.0, 8.0, 8.0)};
  rasterizer.fill_polygons(polygons, kRed);
  VEX_EXPECT(near(rasterizer.pixel_at(4, 4).g, 0.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(7, 7).g, 0.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(8, 8).g, 1.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(1, 4).g, 1.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(4, 1).g, 1.0, 0.01));
}

VEX_TEST(fractional_edge_produces_partial_coverage) {
  Rasterizer rasterizer(10, 10);
  rasterizer.clear(kWhite);
  const std::vector<Polygon> polygons{square(2.5, 2.0, 8.0, 8.0)};
  rasterizer.fill_polygons(polygons, kRed);
  VEX_EXPECT(near(rasterizer.pixel_at(2, 4).g, 0.5, 0.02));
  VEX_EXPECT(near(rasterizer.pixel_at(3, 4).g, 0.0, 0.01));
}

VEX_TEST(opposite_winding_creates_hole) {
  Rasterizer rasterizer(20, 20);
  rasterizer.clear(kWhite);
  Polygon hole = square(6.0, 6.0, 14.0, 14.0);
  std::reverse(hole.begin(), hole.end());
  const std::vector<Polygon> polygons{square(2.0, 2.0, 18.0, 18.0), hole};
  rasterizer.fill_polygons(polygons, kRed);
  VEX_EXPECT(near(rasterizer.pixel_at(10, 10).g, 1.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(3, 10).g, 0.0, 0.01));
}

VEX_TEST(same_winding_overlap_stays_filled) {
  Rasterizer rasterizer(20, 20);
  rasterizer.clear(kWhite);
  const std::vector<Polygon> polygons{square(2.0, 2.0, 18.0, 18.0), square(6.0, 6.0, 14.0, 14.0)};
  rasterizer.fill_polygons(polygons, kRed);
  VEX_EXPECT(near(rasterizer.pixel_at(10, 10).g, 0.0, 0.01));
}

VEX_TEST(shapes_crossing_canvas_edges_are_clipped) {
  Rasterizer rasterizer(10, 10);
  rasterizer.clear(kWhite);
  const std::vector<Polygon> polygons{square(-5.0, -5.0, 3.0, 3.0), square(7.0, 7.0, 25.0, 25.0)};
  rasterizer.fill_polygons(polygons, kRed);
  VEX_EXPECT(near(rasterizer.pixel_at(0, 0).g, 0.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(2, 2).g, 0.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(3, 3).g, 1.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(9, 9).g, 0.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(6, 6).g, 1.0, 0.01));
}

VEX_TEST(shapes_fully_outside_leave_canvas_untouched) {
  Rasterizer rasterizer(10, 10);
  rasterizer.clear(kWhite);
  const std::vector<Polygon> polygons{square(-20.0, 0.0, -5.0, 10.0), square(15.0, 0.0, 30.0, 10.0),
                                      square(0.0, -9.0, 10.0, -1.0)};
  rasterizer.fill_polygons(polygons, kRed);
  for (std::uint32_t x = 0; x < 10; ++x) {
    VEX_EXPECT(near(rasterizer.pixel_at(x, 5).g, 1.0, 0.01));
  }
}

VEX_TEST(translucent_fill_blends_with_background) {
  Rasterizer rasterizer(4, 4);
  rasterizer.clear(kWhite);
  const std::vector<Polygon> polygons{square(0.0, 0.0, 4.0, 4.0)};
  rasterizer.fill_polygons(polygons, {0.0f, 0.0f, 0.0f, 0.5f});
  VEX_EXPECT(near(rasterizer.pixel_at(1, 1).r, 0.5, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(1, 1).a, 1.0, 0.01));
}

VEX_TEST(fill_over_transparent_background_keeps_source_color) {
  Rasterizer rasterizer(4, 4);
  rasterizer.clear({0.0f, 0.0f, 0.0f, 0.0f});
  const std::vector<Polygon> polygons{square(0.0, 0.0, 4.0, 4.0)};
  rasterizer.fill_polygons(polygons, {0.2f, 0.4f, 0.6f, 0.5f});
  const Rgba pixel = rasterizer.pixel_at(2, 2);
  VEX_EXPECT(near(pixel.r, 0.2, 0.01));
  VEX_EXPECT(near(pixel.b, 0.6, 0.01));
  VEX_EXPECT(near(pixel.a, 0.5, 0.01));
}
