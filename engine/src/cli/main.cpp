#include <algorithm>
#include <charconv>
#include <cctype>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <optional>
#include <ranges>
#include <string>
#include <string_view>
#include <vector>

#include "vector_engine/engine.hpp"
#include "vector_engine/parser.hpp"

namespace {

[[nodiscard]] auto read_file(const std::filesystem::path& path) -> std::optional<std::string> {
    std::ifstream input{path, std::ios::binary};
    if (!input) {
        return std::nullopt;
    }
    return std::string{std::istreambuf_iterator<char>{input}, std::istreambuf_iterator<char>{}};
}

[[nodiscard]] auto write_file(const std::filesystem::path& path, const std::vector<std::uint8_t>& data) -> bool {
    std::ofstream output{path, std::ios::binary};
    if (!output) {
        return false;
    }
    output.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
    return output.good();
}

[[nodiscard]] auto parse_unsigned(std::string_view value) -> std::optional<std::uint32_t> {
    std::uint32_t result{};
    const auto parsed = std::from_chars(value.data(), value.data() + value.size(), result);
    if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size()) {
        return std::nullopt;
    }
    return result;
}

[[nodiscard]] auto parse_double(std::string_view value) -> std::optional<double> {
    double result{};
    const auto parsed = std::from_chars(value.data(), value.data() + value.size(), result, std::chars_format::general);
    if (parsed.ec != std::errc{} || parsed.ptr != value.data() + value.size()) {
        return std::nullopt;
    }
    return result;
}

void print_issues(const std::vector<vector_engine::Issue>& issues) {
    for (const auto& issue : issues) {
        std::cerr << (issue.severity == vector_engine::Severity::error ? "error" : "warning") << " [" << issue.code
                  << "] " << issue.path << ": " << issue.message << '\n';
    }
}

[[nodiscard]] auto extension_format(std::filesystem::path path) -> std::optional<vector_engine::ExportFormat> {
    auto extension = path.extension().string();
    if (!extension.empty() && extension.front() == '.') {
        extension.erase(extension.begin());
    }
    std::ranges::transform(extension, extension.begin(), [](unsigned char character) {
        return static_cast<char>(std::tolower(character));
    });
    return vector_engine::format_from_string(extension);
}

void print_usage() {
    std::cerr << "Usage: vector-engine <input.json> <output.svg|png|jpg|bmp> [--width N] [--height N] "
                 "[--scale S] [--fit contain|cover|stretch] [--margin M] [--trim] [--clip] [--include-hidden] "
                 "[--minify] [--bmp-32] [--quality N] [--background #RRGGBB] [--transparent] "
                 "[--target-object ID] [--target-group ID] [--target-layer ID] [--target-workspace ID]\n";
}

}

int main(int argument_count, char** arguments) {
    if (argument_count < 3) {
        print_usage();
        return 2;
    }

    const auto input_path = std::filesystem::path{arguments[1]};
    const auto output_path = std::filesystem::path{arguments[2]};
    const auto source = read_file(input_path);
    const auto format = extension_format(output_path);
    if (!source) {
        std::cerr << "Unable to read input file\n";
        return 2;
    }
    if (!format) {
        std::cerr << "Unsupported output extension\n";
        return 2;
    }

    vector_engine::ExportOptions options;
    options.format = *format;
    for (auto index = 3; index < argument_count; ++index) {
        const auto argument = std::string_view{arguments[index]};
        const auto next_value = [&]() -> std::optional<std::string_view> {
            if (index + 1 >= argument_count) {
                return std::nullopt;
            }
            ++index;
            return std::string_view{arguments[index]};
        };

        if (argument == "--width" || argument == "--height" || argument == "--quality") {
            const auto value = next_value();
            const auto parsed = value ? parse_unsigned(*value) : std::nullopt;
            if (!parsed) {
                std::cerr << "Invalid numeric option\n";
                return 2;
            }
            if (argument == "--width") {
                options.width = *parsed;
            } else if (argument == "--height") {
                options.height = *parsed;
            } else {
                options.quality = static_cast<int>(*parsed);
                options.quality_explicit = true;
            }
        } else if (argument == "--scale" || argument == "--margin") {
            const auto value = next_value();
            const auto parsed = value ? parse_double(*value) : std::nullopt;
            if (!parsed) {
                std::cerr << "Invalid floating point option\n";
                return 2;
            }
            if (argument == "--scale") {
                options.scale = *parsed;
            } else {
                options.margin = *parsed;
            }
        } else if (argument == "--fit") {
            const auto value = next_value();
            const auto parsed = value ? vector_engine::fit_mode_from_string(*value) : std::nullopt;
            if (!parsed) {
                std::cerr << "Invalid fit mode\n";
                return 2;
            }
            options.fit_mode = *parsed;
        } else if (argument == "--trim") {
            options.trim_to_bounds = true;
        } else if (argument == "--clip") {
            options.clip_to_bounds = true;
        } else if (argument == "--include-hidden") {
            options.include_hidden = true;
        } else if (argument == "--minify") {
            options.minify_svg = true;
            options.minify_explicit = true;
        } else if (argument == "--bmp-32") {
            options.bmp_variant = vector_engine::BmpVariant::rgba32;
        } else if (argument == "--target-object" || argument == "--target-group" || argument == "--target-layer" || argument == "--target-workspace") {
            const auto value = next_value();
            if (!value || value->empty()) {
                std::cerr << "Target identifier is required\n";
                return 2;
            }
            options.target.id = std::string{*value};
            if (argument == "--target-object") {
                options.target.kind = vector_engine::TargetKind::object;
            } else if (argument == "--target-group") {
                options.target.kind = vector_engine::TargetKind::group;
            } else if (argument == "--target-layer") {
                options.target.kind = vector_engine::TargetKind::layer;
            } else {
                options.target.kind = vector_engine::TargetKind::workspace;
            }
        } else if (argument == "--background") {
            const auto value = next_value();
            const auto color = value ? vector_engine::parse_color(*value) : std::nullopt;
            if (!color) {
                std::cerr << "Invalid background color\n";
                return 2;
            }
            options.use_document_background = false;
            options.background = color;
        } else if (argument == "--transparent") {
            options.use_document_background = false;
            options.background = std::nullopt;
        } else {
            std::cerr << "Unknown option: " << argument << '\n';
            return 2;
        }
    }

    const vector_engine::Engine engine;
    const auto result = engine.export_image(*source, options);
    print_issues(result.issues);
    if (!result.ok()) {
        return 1;
    }
    if (!write_file(output_path, result.data)) {
        std::cerr << "Unable to write output file\n";
        return 2;
    }
    std::cout << "Wrote " << result.data.size() << " bytes to " << output_path.string() << '\n';
    return 0;
}
