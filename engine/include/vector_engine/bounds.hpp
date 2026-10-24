#pragma once

#include <cstdint>
#include <optional>
#include <vector>

#include "vector_engine/types.hpp"

namespace vector_engine {

struct Viewport {
    BoundingBox source_box{};
    BoundingBox view_box{};
    std::uint32_t output_width{};
    std::uint32_t output_height{};
    FitMode fit_mode{FitMode::contain};
    bool clip_to_source{false};
    Matrix world_to_device{};
};

[[nodiscard]] auto compute_node_bounds(
    const Node& node,
    const Matrix& parent = Matrix::identity(),
    bool include_hidden = false
) -> std::optional<BoundingBox>;

[[nodiscard]] auto compute_scene_bounds(
    const Scene& scene,
    bool include_hidden = false
) -> std::optional<BoundingBox>;

[[nodiscard]] auto prepare_scoped_scene(
    const Scene& source,
    const ExportTarget& target,
    bool include_hidden,
    std::vector<Issue>& issues
) -> std::optional<Scene>;

[[nodiscard]] auto resolve_viewport(
    const Scene& original_scene,
    const Scene& scoped_scene,
    const RenderOptions& options,
    std::uint64_t max_memory_bytes,
    std::vector<Issue>& issues
) -> std::optional<Viewport>;

}
