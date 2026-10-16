#include <catch2/catch_test_macros.hpp>

#include "vector_engine/engine.hpp"

TEST_CASE("SVG output is deterministic and escapes text") {
    constexpr auto source = R"({
        "version":"1.0",
        "document":{"width":200,"height":80,"background":"#FFFFFF"},
        "objects":[{"id":"label","type":"text","x":10,"y":40,"content":"A & <B>","fill":"#171717"}]
    })";

    const vector_engine::Engine engine;
    const auto first = engine.render_svg(source);
    const auto second = engine.render_svg(source);

    REQUIRE(first.ok());
    CHECK(first.value == second.value);
    CHECK(first.value.find("A &amp; &lt;B&gt;") != std::string::npos);
    CHECK(first.value.find("<svg xmlns=") == 0U);
}

TEST_CASE("SVG output includes normalized transformations") {
    constexpr auto source = R"({
        "version":"1.0",
        "document":{"width":100,"height":100},
        "objects":[{"id":"box","type":"rect","x":10,"y":10,"width":20,"height":20,"transform":{"translateX":5,"rotate":45}}]
    })";

    const vector_engine::Engine engine;
    const auto result = engine.render_svg(source);

    REQUIRE(result.ok());
    CHECK(result.value.find("transform=\"matrix(") != std::string::npos);
}
