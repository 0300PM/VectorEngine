#pragma once

#include "vex/rasterizer.hpp"
#include "vex/scene.hpp"

namespace vex {

void render_item(const Item& item, Rasterizer& target);

void render_scene(const Scene& scene, Rasterizer& target);

}
