#include <vector>

#include "check.hpp"
#include "vex/c_api.h"
#include "vex/protocol.hpp"

namespace {

std::vector<double> filled_square_buffer() {
  return {
      1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
      1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
      1.0, 0.0, 0.0, 0.0, 1.0,
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      5.0,
      0.0, 2.0, 2.0,
      1.0, 8.0, 2.0,
      1.0, 8.0, 8.0,
      1.0, 2.0, 8.0,
      4.0,
  };
}

}

VEX_TEST(c_api_reports_protocol_version) {
  VEX_EXPECT(vex_protocol_version() == vex::kProtocolVersion);
}

VEX_TEST(c_api_rejects_invalid_dimensions) {
  VEX_EXPECT(vex_renderer_create(0, 10) == nullptr);
  VEX_EXPECT(vex_renderer_create(10, 0) == nullptr);
  VEX_EXPECT(vex_renderer_create(100000, 10) == nullptr);
}

VEX_TEST(c_api_renders_encoded_scene) {
  VexRenderer* renderer = vex_renderer_create(10, 10);
  VEX_EXPECT(renderer != nullptr);
  VEX_EXPECT(vex_renderer_width(renderer) == 10);
  VEX_EXPECT(vex_renderer_height(renderer) == 10);

  const auto buffer = filled_square_buffer();
  VEX_EXPECT(vex_renderer_render(renderer, buffer.data(), buffer.size()) == VEX_STATUS_OK);

  const uint8_t* pixels = vex_renderer_pixels(renderer);
  VEX_EXPECT(pixels != nullptr);
  const size_t inside = (5 * 10 + 5) * 4;
  const size_t outside = (0 * 10 + 0) * 4;
  VEX_EXPECT(pixels[inside] == 0 && pixels[inside + 1] == 0 && pixels[inside + 2] == 0 && pixels[inside + 3] == 255);
  VEX_EXPECT(pixels[outside] == 255 && pixels[outside + 3] == 255);

  vex_renderer_destroy(renderer);
}

VEX_TEST(c_api_propagates_decode_errors) {
  VexRenderer* renderer = vex_renderer_create(4, 4);
  const std::vector<double> truncated{1.0, 0.0, 0.0};
  VEX_EXPECT(vex_renderer_render(renderer, truncated.data(), truncated.size()) == VEX_STATUS_TRUNCATED_BUFFER);
  VEX_EXPECT(vex_renderer_render(nullptr, truncated.data(), truncated.size()) == VEX_STATUS_INVALID_RENDERER);
  vex_renderer_destroy(renderer);
  vex_renderer_destroy(nullptr);
}
