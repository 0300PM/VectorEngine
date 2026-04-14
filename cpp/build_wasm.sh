#!/usr/bin/env bash
set -euo pipefail

mkdir -p ../public/wasm

emcc \
  vector_engine.cpp \
  scene_renderer.cpp \
  rasterizer.cpp \
  math2d.cpp \
  color.cpp \
  -O3 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT=web \
  -s EXPORTED_FUNCTIONS='["_render_scene","_get_buffer_size"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall"]' \
  -o ../public/wasm/vector_engine.js

echo "WASM build complete: public/wasm/vector_engine.{js,wasm}"