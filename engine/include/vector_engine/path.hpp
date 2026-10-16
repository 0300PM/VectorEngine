#pragma once

#include <string_view>
#include <vector>

#include "vector_engine/types.hpp"

namespace vector_engine {

struct FlattenedSubpath {
    std::vector<Point> points;
    bool closed{};
};

struct FlattenedPath {
    std::vector<FlattenedSubpath> subpaths;
    bool valid{};
};

[[nodiscard]] auto flatten_path(std::string_view data, double tolerance = 0.35) -> FlattenedPath;

}
