#include "check.hpp"
#include "vex/renderer.hpp"

using vex::Item;
using vex::Matrix2D;
using vex::Path;
using vex::Rasterizer;
using vex::Rgba;
using vex::Scene;
using vex::Stroke;
using vex::test::near;

namespace {

Path rectangle(double x, double y, double width, double height) {
  Path path;
  path.move_to({x, y});
  path.line_to({x + width, y});
  path.line_to({x + width, y + height});
  path.line_to({x, y + height});
  path.close();
  return path;
}

constexpr Rgba kWhite{1.0f, 1.0f, 1.0f, 1.0f};
constexpr Rgba kBlue{0.0f, 0.0f, 1.0f, 1.0f};
constexpr Rgba kBlack{0.0f, 0.0f, 0.0f, 1.0f};

}

VEX_TEST(scene_background_is_applied_before_items) {
  Rasterizer rasterizer(8, 8);
  vex::render_scene(Scene{{0.25f, 0.5f, 0.75f, 1.0f}, {}}, rasterizer);
  VEX_EXPECT(near(rasterizer.pixel_at(3, 3).r, 0.25, 0.01));
}

VEX_TEST(filled_rectangle_renders_interior) {
  Rasterizer rasterizer(20, 20);
  Scene scene{kWhite, {Item{rectangle(4.0, 4.0, 8.0, 8.0), Matrix2D::identity(), {kBlue, std::nullopt}, 1.0f}}};
  vex::render_scene(scene, rasterizer);
  VEX_EXPECT(near(rasterizer.pixel_at(8, 8).r, 0.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(2, 2).r, 1.0, 0.01));
}

VEX_TEST(stroke_is_centered_on_outline) {
  Rasterizer rasterizer(30, 30);
  Scene scene{kWhite,
              {Item{rectangle(10.0, 10.0, 10.0, 10.0), Matrix2D::identity(), {std::nullopt, Stroke{kBlack, 4.0}}, 1.0f}}};
  vex::render_scene(scene, rasterizer);
  VEX_EXPECT(near(rasterizer.pixel_at(8, 15).r, 0.0, 0.02));
  VEX_EXPECT(near(rasterizer.pixel_at(11, 15).r, 0.0, 0.02));
  VEX_EXPECT(near(rasterizer.pixel_at(15, 15).r, 1.0, 0.02));
  VEX_EXPECT(near(rasterizer.pixel_at(5, 15).r, 1.0, 0.02));
}

VEX_TEST(transform_moves_geometry) {
  Rasterizer rasterizer(30, 30);
  Scene scene{kWhite,
              {Item{rectangle(0.0, 0.0, 5.0, 5.0), Matrix2D::translation(20.0, 20.0), {kBlue, std::nullopt}, 1.0f}}};
  vex::render_scene(scene, rasterizer);
  VEX_EXPECT(near(rasterizer.pixel_at(22, 22).r, 0.0, 0.01));
  VEX_EXPECT(near(rasterizer.pixel_at(2, 2).r, 1.0, 0.01));
}

VEX_TEST(anisotropic_scale_affects_stroke_width_per_axis) {
  Rasterizer rasterizer(60, 60);
  const Matrix2D matrix = Matrix2D::translation(30.0, 30.0) * Matrix2D::scaling(3.0, 1.0) * Matrix2D::translation(-5.0, -5.0);
  Scene scene{kWhite,
              {Item{rectangle(0.0, 0.0, 10.0, 10.0), matrix, {std::nullopt, Stroke{kBlack, 2.0}}, 1.0f}}};
  vex::render_scene(scene, rasterizer);
  VEX_EXPECT(near(rasterizer.pixel_at(17, 30).r, 0.0, 0.05));
  VEX_EXPECT(near(rasterizer.pixel_at(13, 30).r, 0.0, 0.05));
  VEX_EXPECT(near(rasterizer.pixel_at(10, 30).r, 1.0, 0.05));
  VEX_EXPECT(near(rasterizer.pixel_at(30, 25).r, 0.0, 0.05));
  VEX_EXPECT(near(rasterizer.pixel_at(30, 27).r, 1.0, 0.05));
}

VEX_TEST(item_opacity_scales_alpha) {
  Rasterizer rasterizer(10, 10);
  Scene scene{kWhite, {Item{rectangle(0.0, 0.0, 10.0, 10.0), Matrix2D::identity(), {kBlack, std::nullopt}, 0.25f}}};
  vex::render_scene(scene, rasterizer);
  VEX_EXPECT(near(rasterizer.pixel_at(5, 5).r, 0.75, 0.01));
}

VEX_TEST(singular_transform_renders_nothing) {
  Rasterizer rasterizer(10, 10);
  Scene scene{kWhite, {Item{rectangle(0.0, 0.0, 10.0, 10.0), Matrix2D::scaling(0.0, 0.0), {kBlack, std::nullopt}, 1.0f}}};
  vex::render_scene(scene, rasterizer);
  VEX_EXPECT(near(rasterizer.pixel_at(5, 5).r, 1.0, 0.01));
}
