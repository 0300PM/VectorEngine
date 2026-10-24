#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <chrono>
#include <cstdint>
#include <string>

#include "vector_engine/bounds.hpp"
#include "vector_engine/encoders.hpp"
#include "vector_engine/engine.hpp"
#include "vector_engine/parser.hpp"
#include "vector_engine/rasterizer.hpp"

namespace {

[[nodiscard]] auto has_issue_code(const std::vector<vector_engine::Issue>& issues, std::string_view code) -> bool {
    for (const auto& issue : issues) {
        if (issue.code == code) {
            return true;
        }
    }
    return false;
}

constexpr auto rich_scene_json = R"json({
    "version": "1.0",
    "gradients": [
        {
            "id": "hero-grad",
            "type": "linear",
            "x1": 0,
            "y1": 0,
            "x2": 1,
            "y2": 0,
            "stops": [
                { "offset": 0, "color": "#FF0000" },
                { "offset": 1, "color": "#0000FF" }
            ]
        },
        {
            "id": "glow-grad",
            "type": "radial",
            "cx": 0.5,
            "cy": 0.5,
            "r": 0.5,
            "stops": [
                { "offset": 0, "color": "#00FF00" },
                { "offset": 1, "color": "#00FF0000" }
            ]
        }
    ],
    "document": {
        "width": 200,
        "height": 120,
        "background": "#102030",
        "workspaces": [
            { "id": "badge", "name": "Badge Crop", "x": 20, "y": 20, "width": 60, "height": 60 }
        ]
    },
    "layers": [
        {
            "id": "bg-layer",
            "name": "Background Layer",
            "objects": [
                { "id": "grad-rect", "type": "rect", "x": 10, "y": 10, "width": 80, "height": 40, "fill": "url(#hero-grad)" }
            ]
        },
        {
            "id": "hidden-layer",
            "name": "Hidden Drafts",
            "visible": false,
            "objects": [
                { "id": "draft-circle", "type": "circle", "cx": 150, "cy": 90, "radius": 20, "fill": "#FFAA00" }
            ]
        }
    ],
    "objects": [
        {
            "id": "cluster",
            "type": "group",
            "opacity": 0.9,
            "transform": { "translateX": 30, "translateY": 20 },
            "children": [
                { "id": "child-a", "type": "rect", "x": 0, "y": 0, "width": 40, "height": 30, "fill": "#00FF88" },
                { "id": "child-hidden", "type": "rect", "x": 0, "y": 0, "width": 90, "height": 80, "fill": "#FFFFFF", "visible": false },
                { "id": "child-b", "type": "circle", "cx": 40, "cy": 30, "radius": 10, "fill": "url(#glow-grad)" }
            ]
        }
    ]
})json";

[[nodiscard]] auto make_large_scene(std::size_t count) -> std::string {
    std::string json = R"json({"version":"1.0","document":{"width":800,"height":600,"background":"#FFFFFF"},"objects":[)json";
    json.reserve(count * 120U + 128U);
    for (std::size_t index = 0; index < count; ++index) {
        if (index > 0U) {
            json.push_back(',');
        }
        const auto x = (index * 17U) % 760U;
        const auto y = (index * 13U) % 560U;
        json += R"json({"id":"item-)json" + std::to_string(index) + R"json(","type":"rect","x":)json" + std::to_string(x) +
            R"json(,"y":)json" + std::to_string(y) + R"json(,"width":24,"height":18,"fill":"#0052FF","opacity":0.75})json";
    }
    json += "]}";
    return json;
}

}

TEST_CASE("scoped export preserves transforms, draw order, hidden visibility rules, and does not mutate scene") {
    const std::string snapshot{rich_scene_json};
    const vector_engine::Engine engine;

    vector_engine::ExportTarget group_target;
    group_target.kind = vector_engine::TargetKind::group;
    group_target.id = "cluster";

    const auto [default_bounds, default_issues] = engine.measure_bounds(snapshot, group_target, false);
    REQUIRE(default_issues.empty());
    REQUIRE(default_bounds.has_value());
    CHECK(default_bounds->min_x == Catch::Approx(30.0));
    CHECK(default_bounds->min_y == Catch::Approx(20.0));
    CHECK(default_bounds->max_x == Catch::Approx(80.0));
    CHECK(default_bounds->max_y == Catch::Approx(60.0));

    const auto [hidden_bounds, hidden_issues] = engine.measure_bounds(snapshot, group_target, true);
    REQUIRE(hidden_issues.empty());
    REQUIRE(hidden_bounds.has_value());
    CHECK(hidden_bounds->max_x == Catch::Approx(120.0));
    CHECK(hidden_bounds->max_y == Catch::Approx(100.0));

    vector_engine::RenderOptions svg_options;
    svg_options.target.kind = vector_engine::TargetKind::object;
    svg_options.target.id = "child-a";
    svg_options.trim_to_bounds = true;
    const auto svg = engine.render_svg(snapshot, svg_options);
    REQUIRE(svg.ok());
    CHECK(svg.width == 40U);
    CHECK(svg.height == 30U);
    CHECK(svg.value.find("id=\"cluster\"") != std::string::npos);
    CHECK(svg.value.find("transform=\"matrix(1 0 0 1 30 20)\"") != std::string::npos);
    CHECK(svg.value.find("id=\"grad-rect\"") == std::string::npos);
    CHECK(snapshot == std::string{rich_scene_json});
}

TEST_CASE("gradients serialize in SVG defs, minify cleanly, and sample smoothly in RGBA rasterizer") {
    const vector_engine::Engine engine;

    vector_engine::RenderOptions normal_opts;
    const auto normal_svg = engine.render_svg(rich_scene_json, normal_opts);
    REQUIRE(normal_svg.ok());
    CHECK(normal_svg.value.find("<linearGradient id=\"hero-grad\"") != std::string::npos);
    CHECK(normal_svg.value.find("<radialGradient id=\"glow-grad\"") != std::string::npos);

    vector_engine::RenderOptions minified_opts;
    minified_opts.minify_svg = true;
    const auto minified_svg = engine.render_svg(rich_scene_json, minified_opts);
    REQUIRE(minified_svg.ok());
    CHECK(minified_svg.value.size() < normal_svg.value.size());

    const auto parsed = vector_engine::parse_scene(rich_scene_json);
    REQUIRE(parsed.valid());
    const auto image = vector_engine::rasterize_scene(*parsed.scene);
    const auto left_idx = (25U * image.width + 15U) * 4U;
    const auto right_idx = (25U * image.width + 85U) * 4U;
    CHECK(image.pixels[left_idx] > 200U);
    CHECK(image.pixels[left_idx + 2U] < 60U);
    CHECK(image.pixels[right_idx + 2U] > 200U);
    CHECK(image.pixels[right_idx] < 60U);
}

TEST_CASE("format alpha rules, BMP variants, margins, clipping, and memory budgets report controlled issues") {
    const vector_engine::Engine engine;

    vector_engine::ExportOptions png_opts;
    png_opts.format = vector_engine::ExportFormat::png;
    png_opts.use_document_background = false;
    png_opts.background = std::nullopt;
    png_opts.target.kind = vector_engine::TargetKind::workspace;
    png_opts.target.id = "badge";
    png_opts.margin = 10.0;
    png_opts.clip_to_bounds = true;
    const auto png = engine.export_image(rich_scene_json, png_opts);
    REQUIRE(png.ok());
    CHECK(png.width == 80U);
    CHECK(png.height == 80U);
    CHECK(png.has_alpha);

    vector_engine::ExportOptions jpeg_opts;
    jpeg_opts.format = vector_engine::ExportFormat::jpeg;
    jpeg_opts.use_document_background = false;
    jpeg_opts.background = std::nullopt;
    jpeg_opts.quality = 82;
    const auto jpeg = engine.export_image(rich_scene_json, jpeg_opts);
    REQUIRE(jpeg.ok());
    CHECK_FALSE(jpeg.has_alpha);
    CHECK(has_issue_code(jpeg.issues, "format.jpeg.transparencyFlattened"));

    vector_engine::ExportOptions bmp24_opts;
    bmp24_opts.format = vector_engine::ExportFormat::bmp;
    bmp24_opts.use_document_background = false;
    bmp24_opts.background = std::nullopt;
    const auto bmp24 = engine.export_image(rich_scene_json, bmp24_opts);
    REQUIRE(bmp24.ok());
    CHECK(has_issue_code(bmp24.issues, "format.bmp24.transparencyFlattened"));

    vector_engine::ExportOptions bmp32_opts = bmp24_opts;
    bmp32_opts.bmp_variant = vector_engine::BmpVariant::rgba32;
    const auto bmp32 = engine.export_image(rich_scene_json, bmp32_opts);
    REQUIRE(bmp32.ok());
    CHECK(bmp32.has_alpha);
    CHECK_FALSE(has_issue_code(bmp32.issues, "format.bmp24.transparencyFlattened"));

    vector_engine::ExportOptions memory_exceeded_opts;
    memory_exceeded_opts.format = vector_engine::ExportFormat::png;
    memory_exceeded_opts.width = 2000U;
    memory_exceeded_opts.height = 2000U;
    memory_exceeded_opts.max_memory_bytes = 1024ULL * 1024ULL;
    const auto budget_fail = engine.export_image(rich_scene_json, memory_exceeded_opts);
    CHECK_FALSE(budget_fail.ok());
    CHECK(has_issue_code(budget_fail.issues, "limit.memory"));

    constexpr auto unsupported_scene = R"json({
        "version": "1.0",
        "gradients": [{ "id": "bad", "type": "conic", "stops": [{"offset":0,"color":"#000"},{"offset":1,"color":"#FFF"}] }],
        "document": { "width": 100, "height": 100 },
        "objects": [{ "id": "fx", "type": "rect", "x": 0, "y": 0, "width": 50, "height": 50, "filter": "blur(4px)" }]
    })json";
    const auto invalid = engine.validate(unsupported_scene);
    CHECK_FALSE(invalid.valid());
    CHECK(has_issue_code(invalid.issues, "unsupported.gradient"));
    CHECK(has_issue_code(invalid.issues, "unsupported.filter"));
}

TEST_CASE("large scene regression and native throughput benchmark") {
    const auto large_scene = make_large_scene(2500U);
    const vector_engine::Engine engine;

    const auto svg_start = std::chrono::steady_clock::now();
    const auto svg_res = engine.render_svg(large_scene, {.minify_svg = true});
    const auto svg_ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - svg_start).count();
    REQUIRE(svg_res.ok());
    CHECK(svg_ms < 2000);

    const auto png_start = std::chrono::steady_clock::now();
    const auto reference_a = engine.export_image(large_scene, {.format = vector_engine::ExportFormat::png, .width = 400U, .height = 300U});
    const auto png_ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - png_start).count();
    const auto reference_b = engine.export_image(large_scene, {.format = vector_engine::ExportFormat::png, .width = 400U, .height = 300U});

    REQUIRE(reference_a.ok());
    REQUIRE(reference_a.data == reference_b.data);
    CHECK(png_ms < 5000);
}
