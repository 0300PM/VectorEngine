#pragma once

#include "vector_engine/types.hpp"

namespace vector_engine {

[[nodiscard]] auto render_svg_scene(const Scene& scene, const RenderOptions& options = {}) -> std::string;

}
