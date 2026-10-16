#include "vector_engine/types.hpp"

#include <algorithm>
#include <ranges>

namespace vector_engine {

auto ValidationResult::valid() const -> bool {
    return scene.has_value() && std::ranges::none_of(issues, [](const Issue& issue) {
        return issue.severity == Severity::error;
    });
}

auto TextResult::ok() const -> bool {
    return std::ranges::none_of(issues, [](const Issue& issue) {
        return issue.severity == Severity::error;
    });
}

auto BinaryResult::ok() const -> bool {
    return std::ranges::none_of(issues, [](const Issue& issue) {
        return issue.severity == Severity::error;
    });
}

}
