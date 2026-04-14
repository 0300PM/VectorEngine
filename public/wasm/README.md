Place generated Emscripten output here.

Expected files after compilation:
- vector_engine.js
- vector_engine.wasm

Build from project root:

1. `cd cpp`
2. `bash build_wasm.sh`

Engine sources are split into modules:
- `vector_engine.cpp` - C API exported to JS
- `scene_renderer.cpp` - JSON parsing and scene dispatch
- `rasterizer.cpp` - pixel drawing and blending
- `math2d.cpp` - transform matrix math
- `color.cpp` - color parsing and opacity handling