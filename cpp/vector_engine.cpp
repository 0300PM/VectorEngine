#include <cstdint>
#include <string>
#include <vector>

#include <emscripten.h>

#include "scene_renderer.h"

namespace {
std::vector<uint8_t> g_buffer;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE
uint8_t* render_scene(const char* scene_json, int width, int height) {
  if (scene_json == nullptr) {
    g_buffer.clear();
    return nullptr;
  }

  const bool ok = engine::render_scene_to_buffer(std::string(scene_json), width, height, g_buffer);
  if (!ok || g_buffer.empty()) {
    return nullptr;
  }

  return g_buffer.data();
}

EMSCRIPTEN_KEEPALIVE
int get_buffer_size() {
  return static_cast<int>(g_buffer.size());
}

}
