#include <numbers>

#include "check.hpp"
#include "vex/geometry.hpp"

using vex::Matrix2D;
using vex::Point;
using vex::test::near;

VEX_TEST(identity_matrix_leaves_points_untouched) {
  const Point result = Matrix2D::identity().apply({3.0, -4.5});
  VEX_EXPECT(result == Point{3.0, -4.5});
}

VEX_TEST(matrix_product_applies_right_operand_first) {
  const Matrix2D composed = Matrix2D::translation(10.0, 0.0) * Matrix2D::scaling(2.0, 2.0);
  const Point result = composed.apply({1.0, 1.0});
  VEX_EXPECT(near(result.x, 12.0));
  VEX_EXPECT(near(result.y, 2.0));
}

VEX_TEST(rotation_by_quarter_turn_maps_x_axis_to_y_axis) {
  const Point result = Matrix2D::rotation(std::numbers::pi / 2.0).apply({1.0, 0.0});
  VEX_EXPECT(near(result.x, 0.0, 1e-12));
  VEX_EXPECT(near(result.y, 1.0, 1e-12));
}

VEX_TEST(inverse_undoes_transform) {
  const Matrix2D matrix = Matrix2D::translation(5.0, -2.0) * Matrix2D::rotation(0.7) * Matrix2D::scaling(3.0, 0.5);
  const auto inverse = matrix.inverse();
  VEX_EXPECT(inverse.has_value());
  const Point round_trip = inverse->apply(matrix.apply({1.5, 2.5}));
  VEX_EXPECT(near(round_trip.x, 1.5, 1e-9));
  VEX_EXPECT(near(round_trip.y, 2.5, 1e-9));
}

VEX_TEST(singular_matrix_has_no_inverse) {
  VEX_EXPECT(!Matrix2D::scaling(0.0, 1.0).inverse().has_value());
}

VEX_TEST(max_scale_reports_largest_axis_scale) {
  VEX_EXPECT(near((Matrix2D::rotation(0.3) * Matrix2D::scaling(2.0, 0.5)).max_scale(), 2.0, 1e-9));
}

VEX_TEST(bounds_track_included_points) {
  vex::Bounds bounds;
  VEX_EXPECT(bounds.empty());
  bounds.include({1.0, 2.0});
  bounds.include({-3.0, 5.0});
  VEX_EXPECT(!bounds.empty());
  VEX_EXPECT(near(bounds.min_x, -3.0));
  VEX_EXPECT(near(bounds.max_y, 5.0));
}
