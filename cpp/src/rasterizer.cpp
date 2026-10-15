#include "vex/rasterizer.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <utility>

namespace vex {

namespace {

constexpr std::size_t kChannels = 4;
constexpr float kMinimumCoverage = 1.0f / 1024.0f;
constexpr double kMaxCoordinate = 1.0e9;

[[nodiscard]] std::size_t row_index(double y) noexcept {
  return static_cast<std::size_t>(std::floor(std::max(y, 0.0)));
}

[[nodiscard]] bool is_finite(Point point) noexcept { return std::isfinite(point.x) && std::isfinite(point.y); }

[[nodiscard]] Point clamp_coordinates(Point point) noexcept {
  return {std::clamp(point.x, -kMaxCoordinate, kMaxCoordinate),
          std::clamp(point.y, -kMaxCoordinate, kMaxCoordinate)};
}

}

Rasterizer::Rasterizer(std::uint32_t width, std::uint32_t height)
    : width_(width),
      height_(height),
      coverage_stride_(static_cast<std::size_t>(width) + 2),
      pixels_(static_cast<std::size_t>(width) * height * kChannels, 0),
      coverage_(coverage_stride_ * height, 0.0f) {}

void Rasterizer::clear(Rgba background) {
  const std::array<std::uint8_t, kChannels> bytes{
      channel_to_byte(background.r),
      channel_to_byte(background.g),
      channel_to_byte(background.b),
      channel_to_byte(background.a),
  };
  for (std::size_t index = 0; index < pixels_.size(); index += kChannels) {
    std::copy(bytes.begin(), bytes.end(), pixels_.begin() + static_cast<std::ptrdiff_t>(index));
  }
}

Rgba Rasterizer::pixel_at(std::uint32_t x, std::uint32_t y) const noexcept {
  if (x >= width_ || y >= height_) {
    return {};
  }
  const std::size_t index = (static_cast<std::size_t>(y) * width_ + x) * kChannels;
  return {
      byte_to_channel(pixels_[index]),
      byte_to_channel(pixels_[index + 1]),
      byte_to_channel(pixels_[index + 2]),
      byte_to_channel(pixels_[index + 3]),
  };
}

void Rasterizer::fill_polygons(std::span<const Polygon> polygons, Rgba color) {
  if (color.a <= 0.0f || width_ == 0 || height_ == 0) {
    return;
  }

  Bounds bounds;
  for (const Polygon& polygon : polygons) {
    for (const Point point : polygon) {
      if (!is_finite(point)) {
        return;
      }
      bounds.include(clamp_coordinates(point));
    }
  }
  if (bounds.empty() || bounds.max_x <= 0.0 || bounds.min_x >= static_cast<double>(width_)) {
    return;
  }

  const double height = static_cast<double>(height_);
  const double row_begin = std::clamp(std::floor(bounds.min_y), 0.0, height);
  const double row_end = std::clamp(std::ceil(bounds.max_y), 0.0, height);
  if (row_begin >= row_end) {
    return;
  }
  const auto first_row = static_cast<std::uint32_t>(row_begin);
  const auto end_row = static_cast<std::uint32_t>(row_end);

  std::fill(coverage_.begin() + static_cast<std::ptrdiff_t>(first_row * coverage_stride_),
            coverage_.begin() + static_cast<std::ptrdiff_t>(end_row * coverage_stride_), 0.0f);

  for (const Polygon& polygon : polygons) {
    const std::size_t count = polygon.size();
    if (count < 2) {
      continue;
    }
    for (std::size_t index = 0; index < count; ++index) {
      accumulate_edge(polygon[index], polygon[(index + 1) % count]);
    }
  }

  resolve_rows(first_row, end_row, color);
}

void Rasterizer::accumulate_edge(Point from, Point to) {
  from = clamp_coordinates(from);
  to = clamp_coordinates(to);
  if (from.y == to.y) {
    return;
  }
  float direction = 1.0f;
  if (from.y > to.y) {
    std::swap(from, to);
    direction = -1.0f;
  }

  const double height = static_cast<double>(height_);
  if (to.y <= 0.0 || from.y >= height) {
    return;
  }
  const double dxdy = (to.x - from.x) / (to.y - from.y);
  if (!std::isfinite(dxdy)) {
    return;
  }
  if (from.y < 0.0) {
    from.x -= from.y * dxdy;
    from.y = 0.0;
  }
  if (to.y > height) {
    to.x = from.x + (height - from.y) * dxdy;
    to.y = height;
  }

  std::array<double, 4> splits{from.y, to.y, to.y, to.y};
  std::size_t split_count = 2;
  if (from.x != to.x) {
    for (const double boundary : {0.0, static_cast<double>(width_)}) {
      const double t = (boundary - from.x) / (to.x - from.x);
      if (t > 0.0 && t < 1.0) {
        splits[split_count++] = from.y + t * (to.y - from.y);
      }
    }
  }
  for (std::size_t index = 1; index < split_count; ++index) {
    for (std::size_t position = index; position > 0 && splits[position - 1] > splits[position]; --position) {
      std::swap(splits[position - 1], splits[position]);
    }
  }

  for (std::size_t index = 0; index + 1 < split_count; ++index) {
    const double y0 = splits[index];
    const double y1 = splits[index + 1];
    if (y1 <= y0) {
      continue;
    }
    const Point piece_from{from.x + (y0 - from.y) * dxdy, y0};
    const Point piece_to{from.x + (y1 - from.y) * dxdy, y1};
    accumulate_clipped_edge(piece_from, piece_to, direction);
  }
}

void Rasterizer::accumulate_clipped_edge(Point from, Point to, float direction) {
  const double width = static_cast<double>(width_);
  const double middle_x = (from.x + to.x) * 0.5;
  if (middle_x <= 0.0) {
    accumulate_left_edge(from.y, to.y, direction);
    return;
  }
  if (middle_x >= width) {
    return;
  }
  from.x = std::clamp(from.x, 0.0, width);
  to.x = std::clamp(to.x, 0.0, width);
  accumulate_span_edge(from, to, direction);
}

void Rasterizer::accumulate_left_edge(double y0, double y1, float direction) {
  const std::size_t row_end = std::min<std::size_t>(static_cast<std::size_t>(std::ceil(y1)), height_);
  for (std::size_t row = row_index(y0); row < row_end; ++row) {
    const double dy = std::min(static_cast<double>(row + 1), y1) - std::max(static_cast<double>(row), y0);
    coverage_[row * coverage_stride_] += static_cast<float>(dy) * direction;
  }
}

void Rasterizer::accumulate_span_edge(Point from, Point to, float direction) {
  const double width = static_cast<double>(width_);
  const double dxdy = (to.x - from.x) / (to.y - from.y);
  double x = from.x;
  const std::size_t row_end = std::min<std::size_t>(static_cast<std::size_t>(std::ceil(to.y)), height_);

  for (std::size_t row = row_index(from.y); row < row_end; ++row) {
    const std::size_t line = row * coverage_stride_;
    const double row_bottom = std::min(static_cast<double>(row + 1), to.y);
    const double dy = row_bottom - std::max(static_cast<double>(row), from.y);
    const double x_next =
        row_bottom >= to.y ? to.x : std::clamp(from.x + (row_bottom - from.y) * dxdy, 0.0, width);
    const float d = static_cast<float>(dy) * direction;
    const double x0 = std::min(x, x_next);
    const double x1 = std::max(x, x_next);
    const double x0_floor = std::floor(x0);
    const double x1_ceil = std::ceil(x1);
    const auto x0i = static_cast<std::size_t>(x0_floor);
    const auto x1i = static_cast<std::size_t>(x1_ceil);

    if (x1i <= x0i + 1) {
      const auto x_mid = static_cast<float>(0.5 * (x + x_next) - x0_floor);
      coverage_[line + x0i] += d - d * x_mid;
      coverage_[line + x0i + 1] += d * x_mid;
    } else {
      const double s = 1.0 / (x1 - x0);
      const double x0f = x0 - x0_floor;
      const double a0 = 0.5 * s * (1.0 - x0f) * (1.0 - x0f);
      const double x1f = x1 - x1_ceil + 1.0;
      const double am = 0.5 * s * x1f * x1f;
      coverage_[line + x0i] += d * static_cast<float>(a0);
      if (x1i == x0i + 2) {
        coverage_[line + x0i + 1] += d * static_cast<float>(1.0 - a0 - am);
      } else {
        const double a1 = s * (1.5 - x0f);
        coverage_[line + x0i + 1] += d * static_cast<float>(a1 - a0);
        for (std::size_t column = x0i + 2; column + 1 < x1i; ++column) {
          coverage_[line + column] += d * static_cast<float>(s);
        }
        const double a2 = a1 + static_cast<double>(x1i - x0i - 3) * s;
        coverage_[line + x1i - 1] += d * static_cast<float>(1.0 - a2 - am);
      }
      coverage_[line + x1i] += d * static_cast<float>(am);
    }
    x = x_next;
  }
}

void Rasterizer::resolve_rows(std::uint32_t first_row, std::uint32_t end_row, Rgba color) {
  for (std::uint32_t row = first_row; row < end_row; ++row) {
    const std::size_t line = row * coverage_stride_;
    float accumulated = 0.0f;
    for (std::uint32_t column = 0; column < width_; ++column) {
      accumulated += coverage_[line + column];
      const float coverage = std::min(1.0f, std::abs(accumulated));
      if (coverage > kMinimumCoverage) {
        blend_pixel((static_cast<std::size_t>(row) * width_ + column) * kChannels, color, coverage);
      }
    }
  }
}

void Rasterizer::blend_pixel(std::size_t pixel_index, Rgba color, float coverage) noexcept {
  const float source_alpha = color.a * coverage;
  if (source_alpha <= 0.0f) {
    return;
  }
  std::uint8_t* pixel = &pixels_[pixel_index];
  const float destination_alpha = byte_to_channel(pixel[3]);
  const float destination_weight = destination_alpha * (1.0f - source_alpha);
  const float out_alpha = source_alpha + destination_weight;
  if (out_alpha <= 0.0f) {
    pixel[0] = pixel[1] = pixel[2] = pixel[3] = 0;
    return;
  }
  const auto blend = [&](std::uint8_t destination, float source) {
    return channel_to_byte((source * source_alpha + byte_to_channel(destination) * destination_weight) /
                           out_alpha);
  };
  pixel[0] = blend(pixel[0], color.r);
  pixel[1] = blend(pixel[1], color.g);
  pixel[2] = blend(pixel[2], color.b);
  pixel[3] = channel_to_byte(out_alpha);
}

}
