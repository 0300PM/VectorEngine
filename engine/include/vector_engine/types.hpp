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

struct Style {
    std::optional<Color> fill;
    std::optional<Color> stroke;
    double stroke_width{1.0};
    double opacity{1.0};
    bool visible{true};
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
};

struct Group {
    std::vector<Node> children;
};

struct Document {
    std::uint32_t width{};
    std::uint32_t height{};
    std::string unit{"px"};
    std::optional<Color> background;
};

struct Scene {
    std::string version{"1.0"};
    Document document;
    std::vector<Node> objects;
};

struct ValidationResult {
    std::optional<Scene> scene;
    std::vector<Issue> issues;

    [[nodiscard]] auto valid() const -> bool;
};

struct RenderOptions {
    std::uint32_t width{};
    std::uint32_t height{};
    bool use_document_background{true};
    std::optional<Color> background;
};

struct TextResult {
    std::string value;
    std::vector<Issue> issues;

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
    std::optional<Color> background;
};

struct BinaryResult {
    std::vector<std::uint8_t> data;
    std::vector<Issue> issues;

    [[nodiscard]] auto ok() const -> bool;
};

}
