#pragma once

#include <string_view>

#include "vector_engine/types.hpp"

namespace vector_engine {

class Engine {
public:
    [[nodiscard]] auto validate(std::string_view source) const -> ValidationResult;
    [[nodiscard]] auto render_svg(std::string_view source, const RenderOptions& options = {}) const -> TextResult;
    [[nodiscard]] auto export_image(std::string_view source, const ExportOptions& options) const -> BinaryResult;
};

[[nodiscard]] auto format_from_string(std::string_view value) -> std::optional<ExportFormat>;

}
