#pragma once

#include <span>

#include "vector_engine/types.hpp"

namespace vector_engine {

[[nodiscard]] auto encode_png(const PixelBuffer& buffer) -> std::vector<std::uint8_t>;
[[nodiscard]] auto encode_jpeg(const PixelBuffer& buffer, int quality, Color background) -> std::vector<std::uint8_t>;
[[nodiscard]] auto encode_bmp24(const PixelBuffer& buffer, Color background) -> std::vector<std::uint8_t>;
[[nodiscard]] auto encode_bmp32(const PixelBuffer& buffer) -> std::vector<std::uint8_t>;

}
