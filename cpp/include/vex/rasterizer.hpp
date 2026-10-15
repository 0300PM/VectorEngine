#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

#include "vex/color.hpp"
#include "vex/geometry.hpp"
#include "vex/stroke.hpp"

namespace vex {

class Rasterizer {
 public:
  Rasterizer(std::uint32_t width, std::uint32_t height);

  void clear(Rgba background);
  void fill_polygons(std::span<const Polygon> polygons, Rgba color);

  [[nodiscard]] std::span<const std::uint8_t> pixels() const noexcept { return pixels_; }
  [[nodiscard]] std::uint32_t width() const noexcept { return width_; }
  [[nodiscard]] std::uint32_t height() const noexcept { return height_; }
  [[nodiscard]] Rgba pixel_at(std::uint32_t x, std::uint32_t y) const noexcept;

 private:
  std::uint32_t width_;
  std::uint32_t height_;
  std::size_t coverage_stride_;
  std::vector<std::uint8_t> pixels_;
  std::vector<float> coverage_;

  void accumulate_edge(Point from, Point to);
  void accumulate_clipped_edge(Point from, Point to, float direction);
  void accumulate_left_edge(double y0, double y1, float direction);
  void accumulate_span_edge(Point from, Point to, float direction);
  void resolve_rows(std::uint32_t first_row, std::uint32_t end_row, Rgba color);
  void blend_pixel(std::size_t pixel_index, Rgba color, float coverage) noexcept;
};

}
