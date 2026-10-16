#include "vector_engine/encoders.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <vector>

#include <stb_image_write.h>

namespace vector_engine {

namespace {

void append_bytes(void* context, void* data, int size) {
    auto& output = *static_cast<std::vector<std::uint8_t>*>(context);
    const auto* begin = static_cast<const std::uint8_t*>(data);
    output.insert(output.end(), begin, begin + size);
}

void write_u16(std::vector<std::uint8_t>& output, std::size_t offset, std::uint16_t value) {
    output[offset] = static_cast<std::uint8_t>(value & 0xFFU);
    output[offset + 1U] = static_cast<std::uint8_t>((value >> 8U) & 0xFFU);
}

void write_u32(std::vector<std::uint8_t>& output, std::size_t offset, std::uint32_t value) {
    output[offset] = static_cast<std::uint8_t>(value & 0xFFU);
    output[offset + 1U] = static_cast<std::uint8_t>((value >> 8U) & 0xFFU);
    output[offset + 2U] = static_cast<std::uint8_t>((value >> 16U) & 0xFFU);
    output[offset + 3U] = static_cast<std::uint8_t>((value >> 24U) & 0xFFU);
}

[[nodiscard]] auto composite_channel(std::uint8_t source, std::uint8_t alpha, std::uint8_t background) -> std::uint8_t {
    const auto value = static_cast<unsigned int>(source) * alpha +
        static_cast<unsigned int>(background) * (255U - alpha);
    return static_cast<std::uint8_t>((value + 127U) / 255U);
}

[[nodiscard]] auto composite_rgb(const PixelBuffer& buffer, Color background) -> std::vector<std::uint8_t> {
    const auto pixel_count = static_cast<std::size_t>(buffer.width) * buffer.height;
    std::vector<std::uint8_t> result(pixel_count * 3U);
    for (std::size_t index = 0; index < pixel_count; ++index) {
        const auto source = index * 4U;
        const auto destination = index * 3U;
        const auto alpha = buffer.pixels[source + 3U];
        result[destination] = composite_channel(buffer.pixels[source], alpha, background.red);
        result[destination + 1U] = composite_channel(buffer.pixels[source + 1U], alpha, background.green);
        result[destination + 2U] = composite_channel(buffer.pixels[source + 2U], alpha, background.blue);
    }
    return result;
}

}

auto encode_png(const PixelBuffer& buffer) -> std::vector<std::uint8_t> {
    if (buffer.width == 0U || buffer.height == 0U || buffer.pixels.size() != static_cast<std::size_t>(buffer.width) * buffer.height * 4U) {
        return {};
    }
    std::vector<std::uint8_t> output;
    const auto success = stbi_write_png_to_func(
        append_bytes,
        &output,
        static_cast<int>(buffer.width),
        static_cast<int>(buffer.height),
        4,
        buffer.pixels.data(),
        static_cast<int>(buffer.width * 4U)
    );
    if (success == 0) {
        output.clear();
    }
    return output;
}

auto encode_jpeg(const PixelBuffer& buffer, int quality, Color background) -> std::vector<std::uint8_t> {
    if (buffer.width == 0U || buffer.height == 0U || buffer.pixels.size() != static_cast<std::size_t>(buffer.width) * buffer.height * 4U) {
        return {};
    }
    const auto rgb = composite_rgb(buffer, background);
    std::vector<std::uint8_t> output;
    const auto success = stbi_write_jpg_to_func(
        append_bytes,
        &output,
        static_cast<int>(buffer.width),
        static_cast<int>(buffer.height),
        3,
        rgb.data(),
        std::clamp(quality, 1, 100)
    );
    if (success == 0) {
        output.clear();
    }
    return output;
}

auto encode_bmp24(const PixelBuffer& buffer, Color background) -> std::vector<std::uint8_t> {
    if (buffer.width == 0U || buffer.height == 0U || buffer.pixels.size() != static_cast<std::size_t>(buffer.width) * buffer.height * 4U) {
        return {};
    }
    const auto row_stride = ((buffer.width * 3U + 3U) / 4U) * 4U;
    const auto pixel_bytes = row_stride * buffer.height;
    std::vector<std::uint8_t> output(54U + pixel_bytes);
    output[0] = 0x42U;
    output[1] = 0x4DU;
    write_u32(output, 2U, static_cast<std::uint32_t>(output.size()));
    write_u32(output, 10U, 54U);
    write_u32(output, 14U, 40U);
    write_u32(output, 18U, buffer.width);
    write_u32(output, 22U, buffer.height);
    write_u16(output, 26U, 1U);
    write_u16(output, 28U, 24U);
    write_u32(output, 34U, pixel_bytes);
    write_u32(output, 38U, 2835U);
    write_u32(output, 42U, 2835U);

    for (std::uint32_t destination_y = 0; destination_y < buffer.height; ++destination_y) {
        const auto source_y = buffer.height - destination_y - 1U;
        const auto row_offset = 54U + static_cast<std::size_t>(destination_y) * row_stride;
        for (std::uint32_t x = 0; x < buffer.width; ++x) {
            const auto source = (static_cast<std::size_t>(source_y) * buffer.width + x) * 4U;
            const auto destination = row_offset + static_cast<std::size_t>(x) * 3U;
            const auto alpha = buffer.pixels[source + 3U];
            output[destination] = composite_channel(buffer.pixels[source + 2U], alpha, background.blue);
            output[destination + 1U] = composite_channel(buffer.pixels[source + 1U], alpha, background.green);
            output[destination + 2U] = composite_channel(buffer.pixels[source], alpha, background.red);
        }
    }
    return output;
}

}
