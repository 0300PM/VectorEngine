#pragma once

#include <vector>

#include "vector_engine/bounds.hpp"
#include "vector_engine/types.hpp"

namespace vector_engine {

[[nodiscard]] auto rasterize_scene(const Scene& scene, const RenderOptions& options = {}) -> PixelBuffer;
[[nodiscard]] auto rasterize_viewport(
    const Scene& scene,
    const Viewport& viewport,
    const RenderOptions& options,
    std::vector<Issue>& issues
) -> PixelBuffer;

}
