#pragma once

#include <string_view>

#include "vector_engine/types.hpp"

namespace vector_engine {

[[nodiscard]] auto parse_scene(std::string_view source) -> ValidationResult;
[[nodiscard]] auto parse_color(std::string_view value) -> std::optional<Color>;

}
