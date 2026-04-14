#pragma once

#include "engine_types.h"

namespace engine {

Matrix2D identity_matrix();
Matrix2D multiply_matrix(const Matrix2D& lhs, const Matrix2D& rhs);
Matrix2D translation_matrix(double x, double y);
Matrix2D scale_matrix(double x, double y);
Matrix2D rotation_matrix(double deg);
Matrix2D matrix_from_transform(const Transform& transform);
bool invert_matrix(const Matrix2D& matrix, Matrix2D& out);
void transform_point(const Matrix2D& matrix, double x, double y, double& out_x, double& out_y);

}  // namespace engine
