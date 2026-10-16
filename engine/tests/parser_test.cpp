#include <catch2/catch_test_macros.hpp>

#include "vector_engine/parser.hpp"

TEST_CASE("valid scenes produce a normalized scene graph") {
    constexpr auto source = R"({
        "version":"1.0",
        "document":{"width":320,"height":200,"background":"#FFFFFF"},
        "objects":[{"id":"shape","type":"circle","cx":160,"cy":100,"radius":40,"fill":"#0052FF"}]
    })";

    const auto result = vector_engine::parse_scene(source);

    REQUIRE(result.valid());
    REQUIRE(result.scene.has_value());
    CHECK(result.scene->document.width == 320U);
    CHECK(result.scene->objects.size() == 1U);
}

TEST_CASE("duplicate identifiers are rejected") {
    constexpr auto source = R"({
        "version":"1.0",
        "document":{"width":100,"height":100},
        "objects":[
            {"id":"same","type":"rect","x":0,"y":0,"width":10,"height":10},
            {"id":"same","type":"circle","cx":20,"cy":20,"radius":5}
        ]
    })";

    const auto result = vector_engine::parse_scene(source);

    CHECK_FALSE(result.valid());
    REQUIRE_FALSE(result.issues.empty());
    CHECK(result.issues.back().code == "semantic.duplicateId");
}

TEST_CASE("resource limits reject oversized documents") {
    constexpr auto source = R"({
        "version":"1.0",
        "document":{"width":16384,"height":16384},
        "objects":[]
    })";

    const auto result = vector_engine::parse_scene(source);

    CHECK_FALSE(result.valid());
}
