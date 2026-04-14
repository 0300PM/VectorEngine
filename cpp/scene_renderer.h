#pragma once

#include <string>
#include <vector>

namespace engine {

bool render_scene_to_buffer(const std::string& scene_json, int width, int height, std::vector<uint8_t>& out_buffer);

}  // namespace engine
