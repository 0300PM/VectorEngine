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

[[nodiscard]] auto output_issue(std::string code, std::string message, Severity severity = Severity::error, std::string path = "/output") -> Issue {
    return {std::move(code), std::move(message), std::move(path), severity};
}

[[nodiscard]] auto render_options_from_export(const ExportOptions& options) -> RenderOptions {
    return RenderOptions{
        options.width,
        options.height,
        options.use_document_background,
        options.background,
        options.target,
        options.scale,
        options.include_hidden,
        options.trim_to_bounds,
        options.margin,
        options.clip_to_bounds,
        options.fit_mode,
        options.minify_svg
    };
}

}

auto Engine::validate(std::string_view source) const -> ValidationResult {
    return parse_scene(source);
}

auto Engine::measure_bounds(
    std::string_view source,
    const ExportTarget& target,
    bool include_hidden
) const -> std::pair<std::optional<BoundingBox>, std::vector<Issue>> {
    auto validation = parse_scene(source);
    if (!validation.valid()) {
        return {std::nullopt, std::move(validation.issues)};
    }
    auto issues = std::move(validation.issues);
    const auto scoped = prepare_scoped_scene(*validation.scene, target, include_hidden, issues);
    if (!scoped) {
        return {std::nullopt, std::move(issues)};
    }
    return {compute_scene_bounds(*scoped, true), std::move(issues)};
}

auto Engine::render_svg(std::string_view source, const RenderOptions& options) const -> TextResult {
    auto validation = parse_scene(source);
    if (!validation.valid()) {
        return {{}, std::move(validation.issues)};
    }

    auto issues = std::move(validation.issues);
    const auto scoped = prepare_scoped_scene(*validation.scene, options.target, options.include_hidden, issues);
    if (!scoped) {
        return {{}, std::move(issues)};
    }
    const auto viewport = resolve_viewport(*validation.scene, *scoped, options, 0ULL, issues);
    if (!viewport) {
        return {{}, std::move(issues)};
    }

#if defined(__EXCEPTIONS)
    try {
#endif
        const auto resolved_bg = options.use_document_background ? validation.scene->document.background : options.background;
        const bool has_alpha = !resolved_bg.has_value() || resolved_bg->alpha < 255U;
        return {
            render_svg_viewport(*scoped, *viewport, options),
            std::move(issues),
            viewport->output_width,
            viewport->output_height,
            has_alpha,
            viewport->source_box
        };
#if defined(__EXCEPTIONS)
    } catch (const std::exception& error) {
        issues.push_back(output_issue("render.failed", error.what()));
        return {{}, std::move(issues)};
    }
#endif
}

auto Engine::export_image(std::string_view source, const ExportOptions& options) const -> BinaryResult {
    auto validation = parse_scene(source);
    if (!validation.valid()) {
        return {{}, std::move(validation.issues)};
    }

    auto issues = std::move(validation.issues);
    if (options.quality < 1 || options.quality > 100) {
        issues.push_back(output_issue("output.quality", "JPEG quality must be between 1 and 100", Severity::error, "/output/quality"));
        return {{}, std::move(issues)};
    }
    if (options.quality_explicit && options.format != ExportFormat::jpeg) {
        issues.push_back(output_issue("options.ignoredQuality", "Quality setting only applies to JPEG output and was ignored", Severity::warning, "/output/quality"));
    }
    if (options.minify_explicit && options.minify_svg && options.format != ExportFormat::svg) {
        issues.push_back(output_issue("options.ignoredMinify", "SVG minification setting only applies to SVG output and was ignored", Severity::warning, "/output/minifySvg"));
    }

    auto render_options = render_options_from_export(options);
    const auto resolved_bg = options.use_document_background ? validation.scene->document.background : options.background;
    const bool requested_alpha = !resolved_bg.has_value() || resolved_bg->alpha < 255U;

    Color composite_backdrop{255U, 255U, 255U, 255U};
    if (resolved_bg) {
        composite_backdrop = *resolved_bg;
        composite_backdrop.alpha = 255U;
    }

    if (options.format == ExportFormat::jpeg) {
        if (requested_alpha) {
            issues.push_back(output_issue(
                "format.jpeg.transparencyFlattened",
                "JPEG requires an opaque background; transparent regions were flattened against an opaque backdrop",
                Severity::warning,
                "/output/background"
            ));
        }
        render_options.use_document_background = false;
        render_options.background = composite_backdrop;
    } else if (options.format == ExportFormat::bmp && options.bmp_variant == BmpVariant::rgb24 && requested_alpha) {
        issues.push_back(output_issue(
            "format.bmp24.transparencyFlattened",
            "24-bit BMP does not support alpha transparency; transparent regions were flattened against an opaque backdrop",
            Severity::warning,
            "/output/background"
        ));
    }

    const auto scoped = prepare_scoped_scene(*validation.scene, options.target, options.include_hidden, issues);
    if (!scoped) {
        return {{}, std::move(issues)};
    }

    const auto budget = options.format == ExportFormat::svg ? 0ULL : options.max_memory_bytes;
    const auto viewport = resolve_viewport(*validation.scene, *scoped, render_options, budget, issues);
    if (!viewport) {
        return {{}, std::move(issues)};
    }

#if defined(__EXCEPTIONS)
    try {
#endif
        if (options.format == ExportFormat::svg) {
            const auto svg = render_svg_viewport(*scoped, *viewport, render_options);
            return {
                {svg.begin(), svg.end()},
                std::move(issues),
                viewport->output_width,
                viewport->output_height,
                requested_alpha,
                viewport->source_box
            };
        }

        const auto pixels = rasterize_viewport(*scoped, *viewport, render_options, issues);
        if (pixels.pixels.empty()) {
            issues.push_back(output_issue("raster.failed", "Rasterization did not produce a pixel buffer"));
            return {{}, std::move(issues)};
        }

        std::vector<std::uint8_t> data;
        bool has_alpha = false;
        if (options.format == ExportFormat::png) {
            data = encode_png(pixels);
            has_alpha = requested_alpha;
        } else if (options.format == ExportFormat::jpeg) {
            data = encode_jpeg(pixels, std::clamp(options.quality, 1, 100), composite_backdrop);
            has_alpha = false;
        } else if (options.format == ExportFormat::bmp) {
            if (options.bmp_variant == BmpVariant::rgba32) {
                data = encode_bmp32(pixels);
                has_alpha = requested_alpha;
            } else {
                data = encode_bmp24(pixels, composite_backdrop);
                has_alpha = false;
            }
        }

        if (data.empty()) {
            issues.push_back(output_issue("encode.failed", "The selected image encoder failed"));
        }
        return {
            std::move(data),
            std::move(issues),
            viewport->output_width,
            viewport->output_height,
            has_alpha,
            viewport->source_box
        };
#if defined(__EXCEPTIONS)
    } catch (const std::exception& error) {
        issues.push_back(output_issue("export.failed", error.what()));
        return {{}, std::move(issues)};
    }
#endif
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

auto fit_mode_from_string(std::string_view value) -> std::optional<FitMode> {
    if (value == "contain") {
        return FitMode::contain;
    }
    if (value == "cover") {
        return FitMode::cover;
    }
    if (value == "stretch") {
        return FitMode::stretch;
    }
    return std::nullopt;
}

auto target_kind_from_string(std::string_view value) -> std::optional<TargetKind> {
    if (value == "scene") {
        return TargetKind::scene;
    }
    if (value == "selection") {
        return TargetKind::selection;
    }
    if (value == "group") {
        return TargetKind::group;
    }
    if (value == "layer") {
        return TargetKind::layer;
    }
    if (value == "object") {
        return TargetKind::object;
    }
    if (value == "objects") {
        return TargetKind::objects;
    }
    if (value == "workspace") {
        return TargetKind::workspace;
    }
    return std::nullopt;
}

}
