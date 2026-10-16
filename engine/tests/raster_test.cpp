#include <catch2/catch_test_macros.hpp>

#include "vector_engine/parser.hpp"
#include "vector_engine/rasterizer.hpp"

TEST_CASE("rasterizer paints filled geometry into RGBA pixels") {
    constexpr auto source = R"({
        "version":"1.0",
        "document":{"width":32,"height":32},
        "objects":[{"id":"circle","type":"circle","cx":16,"cy":16,"radius":10,"fill":"#0052FF"}]
    })";
    const auto parsed = vector_engine::parse_scene(source);
    REQUIRE(parsed.valid());

    const auto image = vector_engine::rasterize_scene(*parsed.scene);
    const auto center = (16U * image.width + 16U) * 4U;

    REQUIRE(image.pixels.size() == 32U * 32U * 4U);
    CHECK(image.pixels[center] == 0U);
    CHECK(image.pixels[center + 1U] == 82U);
    CHECK(image.pixels[center + 2U] == 255U);
    CHECK(image.pixels[center + 3U] == 255U);
}

TEST_CASE("transparent documents retain a transparent exterior") {
    constexpr auto source = R"({
        "version":"1.0",
        "document":{"width":16,"height":16},
        "objects":[{"id":"box","type":"rect","x":4,"y":4,"width":8,"height":8,"fill":"#000000"}]
    })";
    const auto parsed = vector_engine::parse_scene(source);
    REQUIRE(parsed.valid());

    const auto image = vector_engine::rasterize_scene(*parsed.scene);

    CHECK(image.pixels[3U] == 0U);
}
