#include "vex/protocol.hpp"

#include <cmath>
#include <cstddef>

namespace vex {

namespace {

constexpr std::size_t kHeaderLength = 6;
constexpr std::size_t kItemHeaderLength = 19;

class Reader {
 public:
  explicit Reader(std::span<const double> data) : data_(data) {}

  [[nodiscard]] bool has(std::size_t count) const noexcept { return offset_ + count <= data_.size(); }

  [[nodiscard]] bool exhausted() const noexcept { return offset_ == data_.size(); }

  [[nodiscard]] std::expected<double, DecodeError> number() {
    if (!has(1)) {
      return std::unexpected(DecodeError::truncated_buffer);
    }
    const double value = data_[offset_++];
    if (!std::isfinite(value)) {
      return std::unexpected(DecodeError::invalid_value);
    }
    return value;
  }

  [[nodiscard]] std::expected<std::size_t, DecodeError> count(std::size_t minimum_unit) {
    const auto value = number();
    if (!value) {
      return std::unexpected(value.error());
    }
    if (*value < 0.0 || *value != std::floor(*value)) {
      return std::unexpected(DecodeError::invalid_value);
    }
    const auto remaining = static_cast<double>(data_.size() - offset_);
    if (*value * static_cast<double>(minimum_unit) > remaining) {
      return std::unexpected(DecodeError::truncated_buffer);
    }
    return static_cast<std::size_t>(*value);
  }

  [[nodiscard]] std::expected<Point, DecodeError> point() {
    const auto x = number();
    if (!x) {
      return std::unexpected(x.error());
    }
    const auto y = number();
    if (!y) {
      return std::unexpected(y.error());
    }
    return Point{*x, *y};
  }

  [[nodiscard]] std::expected<Rgba, DecodeError> color() {
    float channels[4];
    for (float& channel : channels) {
      const auto value = number();
      if (!value) {
        return std::unexpected(value.error());
      }
      channel = static_cast<float>(*value);
    }
    return Rgba{channels[0], channels[1], channels[2], channels[3]};
  }

 private:
  std::span<const double> data_;
  std::size_t offset_{0};
};

[[nodiscard]] std::expected<Path, DecodeError> read_path(Reader& reader) {
  const auto verb_count = reader.count(1);
  if (!verb_count) {
    return std::unexpected(verb_count.error());
  }
  Path path;
  path.verbs.reserve(*verb_count);
  for (std::size_t index = 0; index < *verb_count; ++index) {
    const auto code = reader.number();
    if (!code) {
      return std::unexpected(code.error());
    }
    if (*code < 0.0 || *code > 4.0 || *code != std::floor(*code)) {
      return std::unexpected(DecodeError::invalid_verb);
    }
    const auto verb = static_cast<PathVerb>(static_cast<int>(*code));
    path.verbs.push_back(verb);
    for (std::size_t point_index = 0; point_index < point_count(verb); ++point_index) {
      const auto point = reader.point();
      if (!point) {
        return std::unexpected(point.error());
      }
      path.points.push_back(*point);
    }
  }
  return path;
}

[[nodiscard]] std::expected<Item, DecodeError> read_item(Reader& reader) {
  if (!reader.has(kItemHeaderLength)) {
    return std::unexpected(DecodeError::truncated_buffer);
  }
  Item item;
  double matrix[6];
  for (double& component : matrix) {
    const auto value = reader.number();
    if (!value) {
      return std::unexpected(value.error());
    }
    component = *value;
  }
  item.transform = Matrix2D{matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]};

  const auto opacity = reader.number();
  if (!opacity) {
    return std::unexpected(opacity.error());
  }
  item.opacity = static_cast<float>(*opacity);

  const auto has_fill = reader.number();
  const auto fill = reader.color();
  if (!has_fill || !fill) {
    return std::unexpected(has_fill ? fill.error() : has_fill.error());
  }
  if (*has_fill != 0.0) {
    item.paint.fill = *fill;
  }

  const auto has_stroke = reader.number();
  const auto stroke_color = reader.color();
  const auto stroke_width = reader.number();
  if (!has_stroke || !stroke_color || !stroke_width) {
    return std::unexpected(DecodeError::truncated_buffer);
  }
  if (*has_stroke != 0.0) {
    item.paint.stroke = Stroke{*stroke_color, *stroke_width};
  }

  auto path = read_path(reader);
  if (!path) {
    return std::unexpected(path.error());
  }
  item.path = std::move(*path);
  return item;
}

}

std::expected<Scene, DecodeError> decode_scene(std::span<const double> buffer) {
  Reader reader(buffer);
  if (!reader.has(kHeaderLength)) {
    return std::unexpected(DecodeError::truncated_buffer);
  }
  const auto version = reader.number();
  if (!version) {
    return std::unexpected(version.error());
  }
  if (*version != static_cast<double>(kProtocolVersion)) {
    return std::unexpected(DecodeError::unsupported_protocol);
  }

  Scene scene;
  const auto background = reader.color();
  if (!background) {
    return std::unexpected(background.error());
  }
  scene.background = *background;

  const auto item_count = reader.count(kItemHeaderLength);
  if (!item_count) {
    return std::unexpected(item_count.error());
  }
  scene.items.reserve(*item_count);
  for (std::size_t index = 0; index < *item_count; ++index) {
    auto item = read_item(reader);
    if (!item) {
      return std::unexpected(item.error());
    }
    scene.items.push_back(std::move(*item));
  }
  return scene;
}

std::expected<Path, DecodeError> decode_path(std::span<const double> buffer) {
  Reader reader(buffer);
  auto path = read_path(reader);
  if (!path) {
    return std::unexpected(path.error());
  }
  if (!reader.exhausted()) {
    return std::unexpected(DecodeError::invalid_value);
  }
  return path;
}

std::vector<double> encode_path(const Path& path) {
  std::vector<double> buffer;
  buffer.reserve(1 + path.verbs.size() + path.points.size() * 2);
  buffer.push_back(static_cast<double>(path.verbs.size()));
  std::size_t cursor = 0;
  for (const PathVerb verb : path.verbs) {
    buffer.push_back(static_cast<double>(verb));
    for (std::size_t index = 0; index < point_count(verb); ++index) {
      buffer.push_back(path.points[cursor].x);
      buffer.push_back(path.points[cursor].y);
      ++cursor;
    }
  }
  return buffer;
}

}
