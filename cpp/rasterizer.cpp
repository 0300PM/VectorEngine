#include "rasterizer.h"

#include <algorithm>
#include <cmath>

#include "color.h"
#include "math2d.h"

namespace engine {

Rasterizer::Rasterizer(int width, int height, std::vector<uint8_t>& buffer)
    : width_(width), height_(height), buffer_(buffer) {}

int Rasterizer::clamp_int(int value, int min_value, int max_value) const {
  return std::max(min_value, std::min(max_value, value));
}

void Rasterizer::blend_pixel(int x, int y, const Color& color) {
  if (x < 0 || x >= width_ || y < 0 || y >= height_) {
    return;
  }

  const int index = (y * width_ + x) * 4;
  const double src_a = static_cast<double>(color.a) / 255.0;
  if (src_a <= 0.0) {
    return;
  }

  const double dst_a = static_cast<double>(buffer_[index + 3]) / 255.0;
  const double out_a = src_a + dst_a * (1.0 - src_a);

  if (out_a <= 0.0) {
    buffer_[index] = 0;
    buffer_[index + 1] = 0;
    buffer_[index + 2] = 0;
    buffer_[index + 3] = 0;
    return;
  }

  const auto blend_channel = [&](uint8_t src, uint8_t dst) -> uint8_t {
    const double src_n = static_cast<double>(src) / 255.0;
    const double dst_n = static_cast<double>(dst) / 255.0;
    const double out = (src_n * src_a + dst_n * dst_a * (1.0 - src_a)) / out_a;
    return static_cast<uint8_t>(std::round(clamp_double(out, 0.0, 1.0) * 255.0));
  };

  buffer_[index] = blend_channel(color.r, buffer_[index]);
  buffer_[index + 1] = blend_channel(color.g, buffer_[index + 1]);
  buffer_[index + 2] = blend_channel(color.b, buffer_[index + 2]);
  buffer_[index + 3] = static_cast<uint8_t>(std::round(out_a * 255.0));
}

void Rasterizer::clear(const Color& background) {
  buffer_.assign(static_cast<size_t>(width_) * static_cast<size_t>(height_) * 4, 0);
  for (int y = 0; y < height_; ++y) {
    for (int x = 0; x < width_; ++x) {
      blend_pixel(x, y, background);
    }
  }
}

void Rasterizer::draw_line(int x1, int y1, int x2, int y2, int thickness, const Color& color) {
  int dx = std::abs(x2 - x1);
  int sx = x1 < x2 ? 1 : -1;
  int dy = -std::abs(y2 - y1);
  int sy = y1 < y2 ? 1 : -1;
  int error = dx + dy;
  const int radius = std::max(0, thickness / 2);

  while (true) {
    for (int ox = -radius; ox <= radius; ++ox) {
      for (int oy = -radius; oy <= radius; ++oy) {
        blend_pixel(x1 + ox, y1 + oy, color);
      }
    }

    if (x1 == x2 && y1 == y2) {
      break;
    }

    const int e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x1 += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y1 += sy;
    }
  }
}

void Rasterizer::draw_transformed_rect(double x,
                                       double y,
                                       double rect_w,
                                       double rect_h,
                                       const Matrix2D& matrix,
                                       bool has_fill,
                                       const Color& fill,
                                       bool has_stroke,
                                       const Color& stroke,
                                       double stroke_width) {
  Matrix2D inverse;
  if (!invert_matrix(matrix, inverse)) {
    return;
  }

  double min_x = 1e18;
  double min_y = 1e18;
  double max_x = -1e18;
  double max_y = -1e18;
  const double corners[4][2] = {{x, y}, {x + rect_w, y}, {x + rect_w, y + rect_h}, {x, y + rect_h}};
  for (const auto& corner : corners) {
    double tx;
    double ty;
    transform_point(matrix, corner[0], corner[1], tx, ty);
    min_x = std::min(min_x, tx);
    min_y = std::min(min_y, ty);
    max_x = std::max(max_x, tx);
    max_y = std::max(max_y, ty);
  }

  const int px_min = clamp_int(static_cast<int>(std::floor(min_x)) - 1, 0, width_);
  const int py_min = clamp_int(static_cast<int>(std::floor(min_y)) - 1, 0, height_);
  const int px_max = clamp_int(static_cast<int>(std::ceil(max_x)) + 1, 0, width_);
  const int py_max = clamp_int(static_cast<int>(std::ceil(max_y)) + 1, 0, height_);

  for (int py = py_min; py < py_max; ++py) {
    for (int px = px_min; px < px_max; ++px) {
      double lx;
      double ly;
      transform_point(inverse, static_cast<double>(px) + 0.5, static_cast<double>(py) + 0.5, lx, ly);

      const bool inside = lx >= x && lx <= x + rect_w && ly >= y && ly <= y + rect_h;
      if (!inside) {
        continue;
      }

      const double dist_to_edge =
          std::min(std::min(std::abs(lx - x), std::abs(lx - (x + rect_w))),
                   std::min(std::abs(ly - y), std::abs(ly - (y + rect_h))));
      const bool on_stroke = has_stroke && stroke_width > 0.0 && dist_to_edge <= stroke_width;

      if (has_fill) {
        blend_pixel(px, py, fill);
      }
      if (on_stroke) {
        blend_pixel(px, py, stroke);
      }
    }
  }
}

void Rasterizer::draw_transformed_circle(double cx,
                                         double cy,
                                         double radius,
                                         const Matrix2D& matrix,
                                         bool has_fill,
                                         const Color& fill,
                                         bool has_stroke,
                                         const Color& stroke,
                                         double stroke_width) {
  if (radius <= 0.0) {
    return;
  }

  Matrix2D inverse;
  if (!invert_matrix(matrix, inverse)) {
    return;
  }

  double min_x = 1e18;
  double min_y = 1e18;
  double max_x = -1e18;
  double max_y = -1e18;

  for (int i = 0; i < 32; ++i) {
    const double angle = (static_cast<double>(i) / 32.0) * 2.0 * 3.14159265358979323846;
    const double sx = cx + std::cos(angle) * radius;
    const double sy = cy + std::sin(angle) * radius;
    double tx;
    double ty;
    transform_point(matrix, sx, sy, tx, ty);
    min_x = std::min(min_x, tx);
    min_y = std::min(min_y, ty);
    max_x = std::max(max_x, tx);
    max_y = std::max(max_y, ty);
  }

  const int px_min = clamp_int(static_cast<int>(std::floor(min_x)) - 2, 0, width_);
  const int py_min = clamp_int(static_cast<int>(std::floor(min_y)) - 2, 0, height_);
  const int px_max = clamp_int(static_cast<int>(std::ceil(max_x)) + 2, 0, width_);
  const int py_max = clamp_int(static_cast<int>(std::ceil(max_y)) + 2, 0, height_);

  for (int py = py_min; py < py_max; ++py) {
    for (int px = px_min; px < px_max; ++px) {
      double lx;
      double ly;
      transform_point(inverse, static_cast<double>(px) + 0.5, static_cast<double>(py) + 0.5, lx, ly);
      const double dx = lx - cx;
      const double dy = ly - cy;
      const double distance = std::sqrt(dx * dx + dy * dy);
      if (distance > radius) {
        continue;
      }

      const bool on_stroke = has_stroke && stroke_width > 0.0 && distance >= std::max(0.0, radius - stroke_width);
      if (has_fill) {
        blend_pixel(px, py, fill);
      }
      if (on_stroke) {
        blend_pixel(px, py, stroke);
      }
    }
  }
}

}  // namespace engine
