#pragma once

#include <vector>

#include "engine_types.h"

namespace engine {

class Rasterizer {
 public:
  Rasterizer(int width, int height, std::vector<uint8_t>& buffer);

  void clear(const Color& background);
  void draw_line(int x1, int y1, int x2, int y2, int thickness, const Color& color);
  void draw_transformed_rect(double x,
                             double y,
                             double rect_w,
                             double rect_h,
                             const Matrix2D& matrix,
                             bool has_fill,
                             const Color& fill,
                             bool has_stroke,
                             const Color& stroke,
                             double stroke_width);
  void draw_transformed_circle(double cx,
                               double cy,
                               double radius,
                               const Matrix2D& matrix,
                               bool has_fill,
                               const Color& fill,
                               bool has_stroke,
                               const Color& stroke,
                               double stroke_width);

 private:
  int width_;
  int height_;
  std::vector<uint8_t>& buffer_;

  int clamp_int(int value, int min_value, int max_value) const;
  void blend_pixel(int x, int y, const Color& color);
};

}  // namespace engine
