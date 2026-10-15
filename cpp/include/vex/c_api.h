#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define VEX_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define VEX_EXPORT
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct VexRenderer VexRenderer;

enum VexStatus {
  VEX_STATUS_OK = 0,
  VEX_STATUS_UNSUPPORTED_PROTOCOL = 1,
  VEX_STATUS_TRUNCATED_BUFFER = 2,
  VEX_STATUS_INVALID_VERB = 3,
  VEX_STATUS_INVALID_RENDERER = 4,
  VEX_STATUS_INVALID_VALUE = 5,
  VEX_STATUS_BUFFER_TOO_SMALL = 6
};

#define VEX_PATH_MEASURE_LENGTH 13

VEX_EXPORT int32_t vex_protocol_version(void);
VEX_EXPORT VexRenderer* vex_renderer_create(uint32_t width, uint32_t height);
VEX_EXPORT void vex_renderer_destroy(VexRenderer* renderer);
VEX_EXPORT int32_t vex_renderer_render(VexRenderer* renderer, const double* commands, size_t length);
VEX_EXPORT const uint8_t* vex_renderer_pixels(const VexRenderer* renderer);
VEX_EXPORT uint32_t vex_renderer_width(const VexRenderer* renderer);
VEX_EXPORT uint32_t vex_renderer_height(const VexRenderer* renderer);
VEX_EXPORT int32_t vex_path_measure(const double* commands, size_t length, double tolerance, double* out,
                                    size_t out_length);
VEX_EXPORT int32_t vex_path_simplify(const double* commands, size_t length, double tolerance, double* out,
                                     size_t out_capacity, size_t* out_length);

#ifdef __cplusplus
}
#endif
