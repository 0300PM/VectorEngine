#include "vector_engine/engine.hpp"

#include <algorithm>
#include <cstdint>
#include <exception>
#include <string>
#include <utility>

#include "vector_engine/encoders.hpp"
#include "vector_engine/parser.hpp"
#include "vector_engine/rasterizer.hpp"
#include "vector_engine/svg_renderer.hpp"

namespace vector_engine {

namespace {

constexpr std::uint32_t maximum_dimension = 16'384U;
constexpr std::uint64_t maximum_pixels = 67'108'864ULL;

[[nodiscard]] auto output_issue(std::string code, std::string message, std::string path = "/output") -> Issue {
    return {std::move(code), std::move(message), std::move(path), Severity::error};
}

[[nodiscard]] auto resolve_dimensions(
    const Document& document,
    std::uint32_t requested_width,
    std::uint32_t requested_height,
    std::vector<Issue>& issues
) -> std::pair<std::uint32_t, std::uint32_t> {
    const auto width = requested_width == 0U ? document.width : requested_width;
    const auto height = requested_height == 0U ? document.height : requested_height;
    if (width == 0U || height == 0U || width > maximum_dimension || height > maximum_dimension) {
        issues.push_back(output_issue("output.dimensions", "Output dimensions must be between 1 and 16384 pixels"));
        return {0U, 0U};
    }
    const auto pixels = static_cast<std::uint64_t>(width) * static_cast<std::uint64_t>(height);
    if (pixels > maximum_pixels) {
        issues.push_back(output_issue("output.pixels", "Output cannot exceed 67108864 pixels"));
        return {0U, 0U};
    }
    return {width, height};
}

[[nodiscard]] auto render_options_from_export(const ExportOptions& options, std::uint32_t width, std::uint32_t height) -> RenderOptions {
    return {width, height, options.use_document_background, options.background};
}

}

auto Engine::validate(std::string_view source) const -> ValidationResult {
    return parse_scene(source);
}

auto Engine::render_svg(std::string_view source, const RenderOptions& options) const -> TextResult {
    auto validation = parse_scene(source);
    if (!validation.valid()) {
        return {{}, std::move(validation.issues)};
    }

    auto issues = std::move(validation.issues);
    const auto [width, height] = resolve_dimensions(validation.scene->document, options.width, options.height, issues);
    if (width == 0U || height == 0U) {
        return {{}, std::move(issues)};
    }

    try {
        auto resolved = options;
        resolved.width = width;
        resolved.height = height;
        return {render_svg_scene(*validation.scene, resolved), std::move(issues)};
    } catch (const std::exception& error) {
        issues.push_back(output_issue("render.failed", error.what()));
        return {{}, std::move(issues)};
    }
}

auto Engine::export_image(std::string_view source, const ExportOptions& options) const -> BinaryResult {
    auto validation = parse_scene(source);
    if (!validation.valid()) {
        return {{}, std::move(validation.issues)};
    }

    auto issues = std::move(validation.issues);
    const auto [width, height] = resolve_dimensions(validation.scene->document, options.width, options.height, issues);
    if (width == 0U || height == 0U) {
        return {{}, std::move(issues)};
    }

    try {
        if (options.format == ExportFormat::svg) {
            const auto svg = render_svg_scene(*validation.scene, render_options_from_export(options, width, height));
            return {{svg.begin(), svg.end()}, std::move(issues)};
        }

        const auto pixels = rasterize_scene(*validation.scene, render_options_from_export(options, width, height));
        if (pixels.pixels.empty()) {
            issues.push_back(output_issue("raster.failed", "Rasterization did not produce a pixel buffer"));
            return {{}, std::move(issues)};
        }

        std::vector<std::uint8_t> data;
        if (options.format == ExportFormat::png) {
            data = encode_png(pixels);
        } else if (options.format == ExportFormat::jpeg) {
            data = encode_jpeg(pixels, std::clamp(options.quality, 1, 100), options.background.value_or(Color{255, 255, 255, 255}));
        } else if (options.format == ExportFormat::bmp) {
            data = encode_bmp24(pixels, options.background.value_or(Color{255, 255, 255, 255}));
        }

        if (data.empty()) {
            issues.push_back(output_issue("encode.failed", "The selected image encoder failed"));
        }
        return {std::move(data), std::move(issues)};
    } catch (const std::exception& error) {
        issues.push_back(output_issue("export.failed", error.what()));
        return {{}, std::move(issues)};
    }
}

auto format_from_string(std::string_view value) -> std::optional<ExportFormat> {
    if (value == "svg") {
        return ExportFormat::svg;
    }
    if (value == "png") {
        return ExportFormat::png;
    }
    if (value == "jpeg" || value == "jpg") {
        return ExportFormat::jpeg;
    }
    if (value == "bmp") {
        return ExportFormat::bmp;
    }
    return std::nullopt;
}

}
