#include "color.h"

#include <algorithm>
#include <cmath>

namespace engine {

double clamp_double(double value, double min_value, double max_value) {
  return std::max(min_value, std::min(max_value, value));
}

namespace {

uint8_t hex_nibble(char ch) {
  if (ch >= '0' && ch <= '9') {
    return static_cast<uint8_t>(ch - '0');
  }
  if (ch >= 'a' && ch <= 'f') {
    return static_cast<uint8_t>(10 + (ch - 'a'));
  }
  if (ch >= 'A' && ch <= 'F') {
    return static_cast<uint8_t>(10 + (ch - 'A'));
  }
  return 0;
}

}  // namespace

Color parse_hex_color(const std::string& color_text) {
  if (color_text.empty() || color_text[0] != '#') {
    return {0, 0, 0, 255};
  }

  const auto from_pair = [&](size_t offset) -> uint8_t {
    return static_cast<uint8_t>((hex_nibble(color_text[offset]) << 4) | hex_nibble(color_text[offset + 1]));
  };

  if (color_text.size() == 4 || color_text.size() == 5) {
    const uint8_t r = static_cast<uint8_t>(hex_nibble(color_text[1]) * 17);
    const uint8_t g = static_cast<uint8_t>(hex_nibble(color_text[2]) * 17);
    const uint8_t b = static_cast<uint8_t>(hex_nibble(color_text[3]) * 17);
    const uint8_t a = color_text.size() == 5 ? static_cast<uint8_t>(hex_nibble(color_text[4]) * 17) : 255;
    return {r, g, b, a};
  }

  if (color_text.size() == 7 || color_text.size() == 9) {
    const uint8_t r = from_pair(1);
    const uint8_t g = from_pair(3);
    const uint8_t b = from_pair(5);
    const uint8_t a = color_text.size() == 9 ? from_pair(7) : 255;
    return {r, g, b, a};
  }

  return {0, 0, 0, 255};
}

Color with_opacity(const Color& color, double opacity) {
  const double normalized = clamp_double(opacity, 0.0, 1.0);
  const uint8_t alpha = static_cast<uint8_t>(std::round(static_cast<double>(color.a) * normalized));
  return {color.r, color.g, color.b, alpha};
}

}  // namespace engine
