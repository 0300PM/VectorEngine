#pragma once

#include <string>

#include "engine_types.h"

namespace engine {

double clamp_double(double value, double min_value, double max_value);
Color parse_hex_color(const std::string& color_text);
Color with_opacity(const Color& color, double opacity);

}  // namespace engine
