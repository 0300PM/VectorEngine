#include "scene_renderer.h"

#include <algorithm>
#include <cmath>
#include <string>

#include <emscripten/val.h>

#include "color.h"
#include "engine_types.h"
#include "math2d.h"
#include "rasterizer.h"

using emscripten::val;

namespace engine {

namespace {

double to_number_or_default(const val& object, const char* key, double fallback) {
  const val member = object[key];
  if (member.isUndefined() || member.isNull()) {
    return fallback;
  }
  return member.as<double>();
}

Transform read_transform(const val& shape) {
  Transform transform;
  const val t = shape["transform"];
  if (t.isUndefined() || t.isNull()) {
    return transform;
  }

  const val translate = t["translate"];
  if (translate.isArray() && translate["length"].as<int>() >= 2) {
    transform.tx = translate[0].as<double>();
    transform.ty = translate[1].as<double>();
  }

  const val scale_value = t["scale"];
  if (scale_value.isArray() && scale_value["length"].as<int>() >= 2) {
    transform.sx = scale_value[0].as<double>();
    transform.sy = scale_value[1].as<double>();
  }

  const val origin = t["origin"];
  if (origin.isArray() && origin["length"].as<int>() >= 2) {
    transform.ox = origin[0].as<double>();
    transform.oy = origin[1].as<double>();
  }

  transform.rotate_deg = to_number_or_default(t, "rotate", 0.0);
  return transform;
}

}  // namespace

bool render_scene_to_buffer(const std::string& scene_json, int width, int height, std::vector<uint8_t>& out_buffer) {
  if (width <= 0 || height <= 0) {
    out_buffer.clear();
    return false;
  }

  try {
    const val json = val::global("JSON");
    const val scene = json.call<val>("parse", scene_json);

    const std::string background_text =
        scene["background"].isUndefined() ? std::string("#ffffff") : scene["background"].as<std::string>();

    Rasterizer rasterizer(width, height, out_buffer);
    rasterizer.clear(parse_hex_color(background_text));

    const val shapes = scene["shapes"];
    const int count = shapes["length"].as<int>();

    for (int i = 0; i < count; ++i) {
      const val shape = shapes[i];
      const std::string type = shape["type"].as<std::string>();
      const Transform transform = read_transform(shape);
      const Matrix2D matrix = matrix_from_transform(transform);
      const double opacity = to_number_or_default(shape, "opacity", 1.0);

      if (type == "line") {
        double x1;
        double y1;
        double x2;
        double y2;
        transform_point(matrix, to_number_or_default(shape, "x1", 0.0), to_number_or_default(shape, "y1", 0.0), x1, y1);
        transform_point(matrix, to_number_or_default(shape, "x2", 0.0), to_number_or_default(shape, "y2", 0.0), x2, y2);

        const int base_thickness = static_cast<int>(std::round(to_number_or_default(shape, "thickness", 1.0)));
        const double scale_x = std::sqrt(matrix.a * matrix.a + matrix.b * matrix.b);
        const double scale_y = std::sqrt(matrix.c * matrix.c + matrix.d * matrix.d);
        const int thickness = std::max(1, static_cast<int>(std::round(base_thickness * ((scale_x + scale_y) * 0.5))));

        const bool has_stroke = !shape["stroke"].isUndefined() && !shape["stroke"].isNull();
        const std::string color_text = has_stroke ? shape["stroke"].as<std::string>() : shape["color"].as<std::string>();
        const Color color = with_opacity(parse_hex_color(color_text), opacity);

        rasterizer.draw_line(static_cast<int>(std::round(x1)),
                             static_cast<int>(std::round(y1)),
                             static_cast<int>(std::round(x2)),
                             static_cast<int>(std::round(y2)),
                             thickness,
                             color);
      } else if (type == "rect") {
        const double x = to_number_or_default(shape, "x", 0.0);
        const double y = to_number_or_default(shape, "y", 0.0);
        const double rect_w = to_number_or_default(shape, "width", 0.0);
        const double rect_h = to_number_or_default(shape, "height", 0.0);

        const bool has_fill = !shape["fill"].isUndefined() && !shape["fill"].isNull();
        const bool has_stroke = !shape["stroke"].isUndefined() && !shape["stroke"].isNull();
        const Color fill_color = has_fill ? with_opacity(parse_hex_color(shape["fill"].as<std::string>()), opacity)
                                          : Color{0, 0, 0, 0};
        const Color stroke_color = has_stroke ? with_opacity(parse_hex_color(shape["stroke"].as<std::string>()), opacity)
                                              : Color{0, 0, 0, 0};
        const double stroke_width = std::max(0.0, to_number_or_default(shape, "strokeWidth", 1.0));

        rasterizer.draw_transformed_rect(
            x, y, rect_w, rect_h, matrix, has_fill, fill_color, has_stroke, stroke_color, stroke_width);
      } else if (type == "circle") {
        const double cx = to_number_or_default(shape, "cx", 0.0);
        const double cy = to_number_or_default(shape, "cy", 0.0);
        const double radius = to_number_or_default(shape, "r", 0.0);

        const bool has_fill = !shape["fill"].isUndefined() && !shape["fill"].isNull();
        const bool has_stroke = !shape["stroke"].isUndefined() && !shape["stroke"].isNull();
        const Color fill_color = has_fill ? with_opacity(parse_hex_color(shape["fill"].as<std::string>()), opacity)
                                          : Color{0, 0, 0, 0};
        const Color stroke_color = has_stroke ? with_opacity(parse_hex_color(shape["stroke"].as<std::string>()), opacity)
                                              : Color{0, 0, 0, 0};
        const double stroke_width = std::max(0.0, to_number_or_default(shape, "strokeWidth", 1.0));

        rasterizer.draw_transformed_circle(
            cx, cy, radius, matrix, has_fill, fill_color, has_stroke, stroke_color, stroke_width);
      }
    }

    return true;
  } catch (...) {
    out_buffer.clear();
    return false;
  }
}

}  // namespace engine
