#include <catch2/catch_test_macros.hpp>

#include "vector_engine/encoders.hpp"

TEST_CASE("encoders produce recognizable file signatures") {
    vector_engine::PixelBuffer buffer{
        2U,
        2U,
        {
            255U, 0U, 0U, 255U,
            0U, 255U, 0U, 255U,
            0U, 0U, 255U, 255U,
            255U, 255U, 255U, 0U
        }
    };

    const auto png = vector_engine::encode_png(buffer);
    const auto jpeg = vector_engine::encode_jpeg(buffer, 90, {255U, 255U, 255U, 255U});
    const auto bmp = vector_engine::encode_bmp24(buffer, {255U, 255U, 255U, 255U});

    REQUIRE(png.size() > 8U);
    CHECK(png[0] == 0x89U);
    CHECK(png[1] == 0x50U);
    REQUIRE(jpeg.size() > 2U);
    CHECK(jpeg[0] == 0xFFU);
    CHECK(jpeg[1] == 0xD8U);
    REQUIRE(bmp.size() == 70U);
    CHECK(bmp[0] == 0x42U);
    CHECK(bmp[1] == 0x4DU);
}
