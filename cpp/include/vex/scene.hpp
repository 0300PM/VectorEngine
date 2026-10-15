#pragma once

#include <optional>
#include <vector>

#include "vex/color.hpp"
#include "vex/geometry.hpp"
#include "vex/path.hpp"

namespace vex {

struct Stroke {
  Rgba color;
  double width{};
};

struct Paint {
  std::optional<Rgba> fill;
  std::optional<Stroke> stroke;
};

struct Item {
  Path path;
  Matrix2D transform;
  Paint paint;
  float opacity{1.0f};
};

struct Scene {
  Rgba background;
  std::vector<Item> items;
};

}
