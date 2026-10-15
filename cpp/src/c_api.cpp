#include "vex/c_api.h"

#include <algorithm>
#include <cmath>
#include <new>
#include <span>

#include "vex/path_ops.hpp"
#include "vex/protocol.hpp"
#include "vex/rasterizer.hpp"
#include "vex/renderer.hpp"

namespace {

constexpr uint32_t kMaxDimension = 8192;

[[nodiscard]] bool valid_tolerance(double tolerance) { return std::isfinite(tolerance) && tolerance >= 0.0; }

}

struct VexRenderer {
  vex::Rasterizer rasterizer;
};

extern "C" {

int32_t vex_protocol_version(void) { return vex::kProtocolVersion; }

VexRenderer* vex_renderer_create(uint32_t width, uint32_t height) {
  if (width == 0 || height == 0 || width > kMaxDimension || height > kMaxDimension) {
    return nullptr;
  }
  return new (std::nothrow) VexRenderer{vex::Rasterizer(width, height)};
}

void vex_renderer_destroy(VexRenderer* renderer) { delete renderer; }

int32_t vex_renderer_render(VexRenderer* renderer, const double* commands, size_t length) {
  if (renderer == nullptr || (commands == nullptr && length > 0)) {
    return VEX_STATUS_INVALID_RENDERER;
  }
  const auto scene = vex::decode_scene(std::span<const double>(commands, length));
  if (!scene) {
    return static_cast<int32_t>(scene.error());
  }
  vex::render_scene(*scene, renderer->rasterizer);
  return VEX_STATUS_OK;
}

const uint8_t* vex_renderer_pixels(const VexRenderer* renderer) {
  return renderer == nullptr ? nullptr : renderer->rasterizer.pixels().data();
}

uint32_t vex_renderer_width(const VexRenderer* renderer) {
  return renderer == nullptr ? 0 : renderer->rasterizer.width();
}

uint32_t vex_renderer_height(const VexRenderer* renderer) {
  return renderer == nullptr ? 0 : renderer->rasterizer.height();
}

int32_t vex_path_measure(const double* commands, size_t length, double tolerance, double* out,
                         size_t out_length) {
  if ((commands == nullptr && length > 0) || out == nullptr || !valid_tolerance(tolerance)) {
    return VEX_STATUS_INVALID_VALUE;
  }
  if (out_length < VEX_PATH_MEASURE_LENGTH) {
    return VEX_STATUS_BUFFER_TOO_SMALL;
  }
  const auto path = vex::decode_path(std::span<const double>(commands, length));
  if (!path) {
    return static_cast<int32_t>(path.error());
  }
  const std::vector<double> encoded = vex::encode_measure(vex::measure_path(*path, tolerance));
  std::copy(encoded.begin(), encoded.end(), out);
  return VEX_STATUS_OK;
}

int32_t vex_path_simplify(const double* commands, size_t length, double tolerance, double* out,
                          size_t out_capacity, size_t* out_length) {
  if ((commands == nullptr && length > 0) || out_length == nullptr || !valid_tolerance(tolerance)) {
    return VEX_STATUS_INVALID_VALUE;
  }
  const auto path = vex::decode_path(std::span<const double>(commands, length));
  if (!path) {
    return static_cast<int32_t>(path.error());
  }
  const std::vector<double> encoded = vex::encode_path(vex::simplify_path(*path, tolerance));
  *out_length = encoded.size();
  if (out == nullptr || out_capacity < encoded.size()) {
    return VEX_STATUS_BUFFER_TOO_SMALL;
  }
  std::copy(encoded.begin(), encoded.end(), out);
  return VEX_STATUS_OK;
}

}
