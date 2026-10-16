#pragma once

#include "vector_engine/types.hpp"

namespace vector_engine {

[[nodiscard]] auto rasterize_scene(const Scene& scene, const RenderOptions& options = {}) -> PixelBuffer;

}
