#pragma once

#include <array>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <variant>
#include <vector>

namespace vector_engine {

enum class Severity {
    warning,
    error
};

struct Issue {
    std::string code;
    std::string message;
    std::string path;
    Severity severity{Severity::error};
};

struct Color {
    std::uint8_t red{};
    std::uint8_t green{};
    std::uint8_t blue{};
    std::uint8_t alpha{255};

    auto operator==(const Color&) const -> bool = default;
};

struct Point {
    double x{};
    double y{};
};

struct BoundingBox {
    double min_x{};
    double min_y{};
    double max_x{};
    double max_y{};

    [[nodiscard]] auto width() const -> double { return max_x - min_x; }
    [[nodiscard]] auto height() const -> double { return max_y - min_y; }
    [[nodiscard]] auto valid() const -> bool { return max_x >= min_x && max_y >= min_y; }
};

struct Matrix {
    double a{1.0};
    double b{};
    double c{};
    double d{1.0};
    double e{};
    double f{};

    [[nodiscard]] static auto identity() -> Matrix;
    [[nodiscard]] static auto translation(double x, double y) -> Matrix;
    [[nodiscard]] static auto scaling(double x, double y) -> Matrix;
    [[nodiscard]] static auto rotation(double degrees) -> Matrix;
    [[nodiscard]] static auto skew_x(double degrees) -> Matrix;
    [[nodiscard]] static auto skew_y(double degrees) -> Matrix;
    [[nodiscard]] auto apply(Point point) const -> Point;
    [[nodiscard]] auto is_identity() const -> bool;
};

[[nodiscard]] auto operator*(const Matrix& left, const Matrix& right) -> Matrix;

enum class GradientUnits {
    object_bounding_box,
    user_space_on_use
};

enum class SpreadMethod {
    pad,
    reflect,
    repeat
};

struct GradientStop {
    double offset{};
    Color color{};
    double opacity{1.0};
};

struct LinearGradient {
    std::string id;
    GradientUnits units{GradientUnits::object_bounding_box};
    SpreadMethod spread{SpreadMethod::pad};
    double x1{0.0};
    double y1{0.0};
    double x2{1.0};
    double y2{0.0};
    std::vector<GradientStop> stops;
};

struct RadialGradient {
    std::string id;
    GradientUnits units{GradientUnits::object_bounding_box};
    SpreadMethod spread{SpreadMethod::pad};
    double cx{0.5};
    double cy{0.5};
    double r{0.5};
    std::optional<double> fx;
    std::optional<double> fy;
    std::vector<GradientStop> stops;
};

using Gradient = std::variant<LinearGradient, RadialGradient>;

enum class BlendMode {
    normal,
    multiply,
    screen,
    overlay,
    darken,
    lighten
};

struct Style {
    std::optional<Color> fill;
    std::optional<Color> stroke;
    double stroke_width{1.0};
    double opacity{1.0};
    bool visible{true};
    std::optional<std::string> fill_gradient_id;
    std::optional<std::string> stroke_gradient_id;
    BlendMode blend_mode{BlendMode::normal};
};

struct Rectangle {
    double x{};
    double y{};
    double width{};
    double height{};
    double radius_x{};
    double radius_y{};
};

struct Circle {
    double center_x{};
    double center_y{};
    double radius{};
};

struct Ellipse {
    double center_x{};
    double center_y{};
    double radius_x{};
    double radius_y{};
};

struct Line {
    Point start;
    Point end;
};

struct Polygon {
    std::vector<Point> points;
};

struct Polyline {
    std::vector<Point> points;
};

enum class FillRule {
    nonzero,
    evenodd
};

struct Path {
    std::string data;
    FillRule fill_rule{FillRule::nonzero};
};

enum class TextAnchor {
    start,
    middle,
    end
};

struct Text {
    double x{};
    double y{};
    std::string content;
    double font_size{16.0};
    std::string font_family{"Inter, ui-sans-serif, system-ui, sans-serif"};
    int font_weight{400};
    TextAnchor anchor{TextAnchor::start};
    double letter_spacing{};
};

struct Group;
using Geometry = std::variant<Rectangle, Circle, Ellipse, Line, Polygon, Polyline, Path, Text, std::shared_ptr<Group>>;

struct Node {
    std::string id;
    Style style;
    Matrix transform;
    Geometry geometry;
    std::string name{};
    std::optional<std::string> layer_id{};
};

struct Group {
    std::vector<Node> children;
};

struct Layer {
    std::string id;
    std::string name;
    bool visible{true};
    double opacity{1.0};
    std::vector<Node> objects;
};

struct Workspace {
    std::string id;
    std::string name;
    double x{};
    double y{};
    double width{};
    double height{};
};

struct Document {
    std::uint32_t width{};
    std::uint32_t height{};
    std::string unit{"px"};
    std::optional<Color> background;
    std::vector<Workspace> workspaces{};
};

struct Scene {
    std::string version{"1.0"};
    Document document;
    std::vector<Node> objects;
    std::vector<Gradient> gradients{};
    std::vector<Layer> layers{};
};

struct ValidationResult {
    std::optional<Scene> scene;
    std::vector<Issue> issues;

    [[nodiscard]] auto valid() const -> bool;
};

enum class TargetKind {
    scene,
    selection,
    group,
    layer,
    object,
    objects,
    workspace
};

enum class FitMode {
    contain,
    cover,
    stretch
};

enum class BmpVariant {
    rgb24,
    rgba32
};

struct ExportTarget {
    TargetKind kind{TargetKind::scene};
    std::string id{};
    std::vector<std::string> ids{};
    std::optional<BoundingBox> region{};
};

struct RenderOptions {
    std::uint32_t width{};
    std::uint32_t height{};
    bool use_document_background{true};
    std::optional<Color> background{};
    ExportTarget target{};
    double scale{1.0};
    bool include_hidden{false};
    bool trim_to_bounds{false};
    double margin{0.0};
    bool clip_to_bounds{false};
    FitMode fit_mode{FitMode::contain};
    bool minify_svg{false};
};

struct TextResult {
    std::string value;
    std::vector<Issue> issues;
    std::uint32_t width{};
    std::uint32_t height{};
    bool has_alpha{true};
    BoundingBox source_bounds{};

    [[nodiscard]] auto ok() const -> bool;
};

struct PixelBuffer {
    std::uint32_t width{};
    std::uint32_t height{};
    std::vector<std::uint8_t> pixels;
};

enum class ExportFormat {
    svg,
    png,
    jpeg,
    bmp
};

struct ExportOptions {
    ExportFormat format{ExportFormat::png};
    std::uint32_t width{};
    std::uint32_t height{};
    int quality{90};
    bool use_document_background{true};
    std::optional<Color> background{};
    ExportTarget target{};
    double scale{1.0};
    bool include_hidden{false};
    bool trim_to_bounds{false};
    double margin{0.0};
    bool clip_to_bounds{false};
    FitMode fit_mode{FitMode::contain};
    bool minify_svg{false};
    BmpVariant bmp_variant{BmpVariant::rgb24};
    std::uint64_t max_memory_bytes{512ULL * 1024ULL * 1024ULL};
    bool quality_explicit{false};
    bool minify_explicit{false};
};

struct BinaryResult {
    std::vector<std::uint8_t> data;
    std::vector<Issue> issues;
    std::uint32_t width{};
    std::uint32_t height{};
    bool has_alpha{false};
    BoundingBox source_bounds{};

    [[nodiscard]] auto ok() const -> bool;
};

}
