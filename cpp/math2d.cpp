#include "math2d.h"

#include <cmath>

namespace engine {

namespace {
constexpr double k_pi = 3.14159265358979323846;
}

Matrix2D identity_matrix() {
  return {1.0, 0.0, 0.0, 1.0, 0.0, 0.0};
}

Matrix2D multiply_matrix(const Matrix2D& lhs, const Matrix2D& rhs) {
  return {
      lhs.a * rhs.a + lhs.c * rhs.b,
      lhs.b * rhs.a + lhs.d * rhs.b,
      lhs.a * rhs.c + lhs.c * rhs.d,
      lhs.b * rhs.c + lhs.d * rhs.d,
      lhs.a * rhs.e + lhs.c * rhs.f + lhs.e,
      lhs.b * rhs.e + lhs.d * rhs.f + lhs.f,
  };
}

Matrix2D translation_matrix(double x, double y) {
  return {1.0, 0.0, 0.0, 1.0, x, y};
}

Matrix2D scale_matrix(double x, double y) {
  return {x, 0.0, 0.0, y, 0.0, 0.0};
}

Matrix2D rotation_matrix(double deg) {
  const double rad = deg * (k_pi / 180.0);
  const double c = std::cos(rad);
  const double s = std::sin(rad);
  return {c, s, -s, c, 0.0, 0.0};
}

Matrix2D matrix_from_transform(const Transform& transform) {
  Matrix2D matrix = identity_matrix();
  matrix = multiply_matrix(matrix, translation_matrix(transform.tx, transform.ty));
  matrix = multiply_matrix(matrix, translation_matrix(transform.ox, transform.oy));
  matrix = multiply_matrix(matrix, rotation_matrix(transform.rotate_deg));
  matrix = multiply_matrix(matrix, scale_matrix(transform.sx, transform.sy));
  matrix = multiply_matrix(matrix, translation_matrix(-transform.ox, -transform.oy));
  return matrix;
}

bool invert_matrix(const Matrix2D& matrix, Matrix2D& out) {
  const double det = matrix.a * matrix.d - matrix.b * matrix.c;
  if (std::abs(det) < 1e-10) {
    return false;
  }

  const double inv_det = 1.0 / det;
  out.a = matrix.d * inv_det;
  out.b = -matrix.b * inv_det;
  out.c = -matrix.c * inv_det;
  out.d = matrix.a * inv_det;
  out.e = (matrix.c * matrix.f - matrix.d * matrix.e) * inv_det;
  out.f = (matrix.b * matrix.e - matrix.a * matrix.f) * inv_det;
  return true;
}

void transform_point(const Matrix2D& matrix, double x, double y, double& out_x, double& out_y) {
  out_x = matrix.a * x + matrix.c * y + matrix.e;
  out_y = matrix.b * x + matrix.d * y + matrix.f;
}

}  // namespace engine
