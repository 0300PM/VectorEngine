#pragma once

#include "vector_engine/bounds.hpp"
#include "vector_engine/types.hpp"

namespace vector_engine {

[[nodiscard]] auto render_svg_scene(const Scene& scene, const RenderOptions& options = {}) -> std::string;
[[nodiscard]] auto render_svg_viewport(
    const Scene& scene,
    const Viewport& viewport,
    const RenderOptions& options
) -> std::string;

}
