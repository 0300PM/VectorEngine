#include "vector_engine/types.hpp"

#include <cmath>

namespace vector_engine {

namespace {

constexpr auto pi = 3.141592653589793238462643383279502884;
constexpr auto epsilon = 1.0e-12;

}

auto Matrix::identity() -> Matrix {
    return {};
}

auto Matrix::translation(double x, double y) -> Matrix {
    return {1.0, 0.0, 0.0, 1.0, x, y};
}

auto Matrix::scaling(double x, double y) -> Matrix {
    return {x, 0.0, 0.0, y, 0.0, 0.0};
}

auto Matrix::rotation(double degrees) -> Matrix {
    const auto radians = degrees * pi / 180.0;
    const auto sine = std::sin(radians);
    const auto cosine = std::cos(radians);
    return {cosine, sine, -sine, cosine, 0.0, 0.0};
}

auto Matrix::skew_x(double degrees) -> Matrix {
    return {1.0, 0.0, std::tan(degrees * pi / 180.0), 1.0, 0.0, 0.0};
}

auto Matrix::skew_y(double degrees) -> Matrix {
    return {1.0, std::tan(degrees * pi / 180.0), 0.0, 1.0, 0.0, 0.0};
}

auto Matrix::apply(Point point) const -> Point {
    return {
        a * point.x + c * point.y + e,
        b * point.x + d * point.y + f
    };
}

auto Matrix::is_identity() const -> bool {
    return std::abs(a - 1.0) < epsilon && std::abs(b) < epsilon && std::abs(c) < epsilon &&
        std::abs(d - 1.0) < epsilon && std::abs(e) < epsilon && std::abs(f) < epsilon;
}

auto operator*(const Matrix& left, const Matrix& right) -> Matrix {
    return {
        left.a * right.a + left.c * right.b,
        left.b * right.a + left.d * right.b,
        left.a * right.c + left.c * right.d,
        left.b * right.c + left.d * right.d,
        left.a * right.e + left.c * right.f + left.e,
        left.b * right.e + left.d * right.f + left.f
    };
}

}
