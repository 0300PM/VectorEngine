#include <limits>
#include <vector>

#include "check.hpp"
#include "vex/protocol.hpp"

using vex::DecodeError;
using vex::decode_scene;

namespace {

std::vector<double> sample_buffer() {
  return {
      1.0, 0.1, 0.2, 0.3, 1.0, 1.0,
      1.0, 0.0, 0.0, 1.0, 5.0, 6.0, 0.5,
      1.0, 1.0, 0.0, 0.0, 1.0,
      1.0, 0.0, 0.0, 1.0, 1.0, 3.0,
      4.0,
      0.0, 0.0, 0.0,
      1.0, 10.0, 0.0,
      3.0, 10.0, 5.0, 5.0, 10.0, 0.0, 10.0,
      4.0,
  };
}

}

VEX_TEST(decodes_background_and_items) {
  const auto scene = decode_scene(sample_buffer());
  VEX_EXPECT(scene.has_value());
  VEX_EXPECT(vex::test::near(scene->background.g, 0.2, 1e-6));
  VEX_EXPECT(scene->items.size() == 1);
  const auto& item = scene->items[0];
  VEX_EXPECT(vex::test::near(item.transform.e, 5.0));
  VEX_EXPECT(vex::test::near(item.opacity, 0.5, 1e-6));
  VEX_EXPECT(item.paint.fill.has_value());
  VEX_EXPECT(item.paint.stroke.has_value());
  VEX_EXPECT(vex::test::near(item.paint.stroke->width, 3.0));
  VEX_EXPECT(item.path.verbs.size() == 4);
  VEX_EXPECT(item.path.points.size() == 5);
}

VEX_TEST(rejects_unknown_protocol_version) {
  auto buffer = sample_buffer();
  buffer[0] = 2.0;
  const auto scene = decode_scene(buffer);
  VEX_EXPECT(!scene.has_value() && scene.error() == DecodeError::unsupported_protocol);
}

VEX_TEST(rejects_truncated_buffer) {
  auto buffer = sample_buffer();
  buffer.pop_back();
  buffer.pop_back();
  const auto scene = decode_scene(buffer);
  VEX_EXPECT(!scene.has_value() && scene.error() == DecodeError::truncated_buffer);
}

VEX_TEST(rejects_invalid_verb) {
  auto buffer = sample_buffer();
  buffer[25] = 9.0;
  const auto scene = decode_scene(buffer);
  VEX_EXPECT(!scene.has_value() && scene.error() == DecodeError::invalid_verb);
}

VEX_TEST(rejects_non_finite_values) {
  auto buffer = sample_buffer();
  buffer[29] = std::numeric_limits<double>::quiet_NaN();
  const auto scene = decode_scene(buffer);
  VEX_EXPECT(!scene.has_value() && scene.error() == DecodeError::invalid_value);
}

VEX_TEST(rejects_item_count_exceeding_buffer) {
  auto buffer = sample_buffer();
  buffer[5] = 1000.0;
  const auto scene = decode_scene(buffer);
  VEX_EXPECT(!scene.has_value() && scene.error() == DecodeError::truncated_buffer);
}

VEX_TEST(empty_scene_decodes_without_items) {
  const std::vector<double> buffer{1.0, 0.0, 0.0, 0.0, 0.0, 0.0};
  const auto scene = decode_scene(buffer);
  VEX_EXPECT(scene.has_value() && scene->items.empty());
}
