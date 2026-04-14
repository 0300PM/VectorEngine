#pragma once

#include <cstdint>

namespace engine {

struct Color {
  uint8_t r;
  uint8_t g;
  uint8_t b;
  uint8_t a;
};

struct Transform {
  double tx = 0.0;
  double ty = 0.0;
  double sx = 1.0;
  double sy = 1.0;
  double rotate_deg = 0.0;
  double ox = 0.0;
  double oy = 0.0;
};

struct Matrix2D {
  double a;
  double b;
  double c;
  double d;
  double e;
  double f;
};

}  // namespace engine
