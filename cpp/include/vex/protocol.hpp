#pragma once

#include <cstdint>
#include <expected>
#include <span>

#include "vex/scene.hpp"

namespace vex {

inline constexpr std::int32_t kProtocolVersion = 1;

enum class DecodeError : std::int32_t {
  unsupported_protocol = 1,
  truncated_buffer = 2,
  invalid_verb = 3,
  invalid_value = 5,
};

[[nodiscard]] std::expected<Scene, DecodeError> decode_scene(std::span<const double> buffer);

}
