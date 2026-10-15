#pragma once

#include <algorithm>
#include <cstdint>

namespace vex {

struct Rgba {
  float r{};
  float g{};
  float b{};
  float a{};

  [[nodiscard]] constexpr Rgba with_alpha_scaled(float factor) const noexcept {
    return {r, g, b, std::clamp(a * factor, 0.0f, 1.0f)};
  }
};

[[nodiscard]] constexpr std::uint8_t channel_to_byte(float channel) noexcept {
  return static_cast<std::uint8_t>(std::clamp(channel, 0.0f, 1.0f) * 255.0f + 0.5f);
}

[[nodiscard]] constexpr float byte_to_channel(std::uint8_t byte) noexcept {
  return static_cast<float>(byte) / 255.0f;
}

}
