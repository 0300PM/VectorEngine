#pragma once

#include <optional>
#include <string_view>

#include "vector_engine/bounds.hpp"
#include "vector_engine/types.hpp"

namespace vector_engine {

class Engine {
public:
    [[nodiscard]] auto validate(std::string_view source) const -> ValidationResult;
    [[nodiscard]] auto render_svg(std::string_view source, const RenderOptions& options = {}) const -> TextResult;
    [[nodiscard]] auto export_image(std::string_view source, const ExportOptions& options) const -> BinaryResult;
    [[nodiscard]] auto measure_bounds(
        std::string_view source,
        const ExportTarget& target = {},
        bool include_hidden = false
    ) const -> std::pair<std::optional<BoundingBox>, std::vector<Issue>>;
};

[[nodiscard]] auto format_from_string(std::string_view value) -> std::optional<ExportFormat>;
[[nodiscard]] auto fit_mode_from_string(std::string_view value) -> std::optional<FitMode>;
[[nodiscard]] auto target_kind_from_string(std::string_view value) -> std::optional<TargetKind>;

}
