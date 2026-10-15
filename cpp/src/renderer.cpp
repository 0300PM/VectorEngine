#include "vex/renderer.hpp"

#include <cmath>
#include <vector>

#include "vex/flatten.hpp"
#include "vex/stroke.hpp"

namespace vex {

namespace {

[[nodiscard]] std::vector<Polygon> transform_polylines(std::span<const Polyline> polylines,
                                                       const Matrix2D& matrix) {
  std::vector<Polygon> polygons;
  polygons.reserve(polylines.size());
  for (const Polyline& polyline : polylines) {
    Polygon polygon;
    polygon.reserve(polyline.points.size());
    for (const Point point : polyline.points) {
      polygon.push_back(matrix.apply(point));
    }
    polygons.push_back(std::move(polygon));
  }
  return polygons;
}

void transform_in_place(std::vector<Polygon>& polygons, const Matrix2D& matrix) {
  for (Polygon& polygon : polygons) {
    for (Point& point : polygon) {
      point = matrix.apply(point);
    }
  }
}

}

void render_item(const Item& item, Rasterizer& target) {
  const double scale = item.transform.max_scale();
  if (!(scale > 0.0) || !std::isfinite(scale) || item.opacity <= 0.0f) {
    return;
  }
  const double tolerance = kDefaultFlattenTolerance / scale;
  const std::vector<Polyline> polylines = flatten(item.path, tolerance);
  if (polylines.empty()) {
    return;
  }

  if (item.paint.fill) {
    target.fill_polygons(transform_polylines(polylines, item.transform),
                         item.paint.fill->with_alpha_scaled(item.opacity));
  }

  if (item.paint.stroke && item.paint.stroke->width > 0.0) {
    std::vector<Polygon> outline = stroke_outline(polylines, item.paint.stroke->width, tolerance);
    transform_in_place(outline, item.transform);
    target.fill_polygons(outline, item.paint.stroke->color.with_alpha_scaled(item.opacity));
  }
}

void render_scene(const Scene& scene, Rasterizer& target) {
  target.clear(scene.background);
  for (const Item& item : scene.items) {
    render_item(item, target);
  }
}

}
