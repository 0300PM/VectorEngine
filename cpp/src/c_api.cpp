#include "vex/c_api.h"

#include <new>
#include <span>

#include "vex/protocol.hpp"
#include "vex/rasterizer.hpp"
#include "vex/renderer.hpp"

namespace {

constexpr uint32_t kMaxDimension = 8192;

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

}
