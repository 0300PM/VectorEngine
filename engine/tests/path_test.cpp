#include <catch2/catch_test_macros.hpp>

#include "vector_engine/path.hpp"

TEST_CASE("path processing flattens curves and arcs") {
    const auto path = vector_engine::flatten_path("M 10 10 C 20 0 30 20 40 10 A 10 10 0 0 1 60 10 Z");

    REQUIRE(path.valid);
    REQUIRE(path.subpaths.size() == 1U);
    CHECK(path.subpaths.front().closed);
    CHECK(path.subpaths.front().points.size() > 8U);
}

TEST_CASE("relative path commands preserve coordinates") {
    const auto path = vector_engine::flatten_path("M10 10 l20 0 v20 h-20 z");

    REQUIRE(path.valid);
    REQUIRE(path.subpaths.front().points.size() == 4U);
    CHECK(path.subpaths.front().points[2].x == 30.0);
    CHECK(path.subpaths.front().points[2].y == 30.0);
}

TEST_CASE("malformed path data is rejected") {
    CHECK_FALSE(vector_engine::flatten_path("M 10 C 20").valid);
}
