# Vector Engine

Vector Engine is a JSON-driven graphics engine with a C++23 rendering core, WebAssembly bindings, and a responsive Vue 3 workspace. It validates a versioned scene document, renders a deterministic preview, and exports SVG, PNG, JPEG, and BMP files entirely on the local machine.

## Features

- Versioned JSON scene format with JSON Schema validation
- Rectangle, rounded rectangle, circle, ellipse, line, polygon, polyline, path, text, and group objects
- Solid fills, strokes, opacity, visibility, and affine transformations
- Deterministic C++ SVG generation with XML escaping
- Shared RGBA raster pipeline for PNG, JPEG, and 24-bit BMP export
- C++23 native library, CLI, and Emscripten bindings from one core implementation
- CodeMirror JSON editor with live validation and debounced rendering
- Responsive preview with fit and zoom controls
- Configurable dimensions, scale, background, and JPEG quality
- Resource limits for source size, dimensions, object count, path size, nesting, and raster area
- Vitest, Playwright, and Catch2 test suites

## Quick start

Requirements:

- Node.js 20 or newer
- npm 10 or newer

```bash
npm install
npm run dev
```

The workspace starts on the URL printed by Vite.

## Web commands

```bash
npm run dev
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Playwright requires its browser runtime on a new machine:

```bash
npx playwright install --with-deps chromium
```

## Native engine

Requirements:

- A C++23 compiler
- CMake 3.24 or newer
- Ninja

```bash
cmake --preset native-debug
cmake --build --preset native-debug
ctest --preset native-debug
```

The native CLI is generated at `build/native-debug/engine/vector-engine`.

```bash
build/native-debug/engine/vector-engine examples/getting-started.json output.png --width 1200 --height 800
```

Supported CLI options are `--width`, `--height`, `--quality`, `--background`, and `--transparent`.

## WebAssembly engine

Install and activate the Emscripten SDK, then run:

```bash
cmake --preset wasm-release
cmake --build --preset wasm-release
```

The build copies `vector_engine.js` and `vector_engine.wasm` to `apps/web/public/wasm`. A verified prebuilt pair is included so the application uses the C++23 WebAssembly core immediately. Rebuild the pair after changing native engine code. The web adapter loads these artifacts asynchronously and uses typed arrays for encoded output. When the artifacts are absent, development mode uses the API-compatible browser renderer so the UI remains usable.

## Scene example

```json
{
  "version": "1.0",
  "document": {
    "width": 1200,
    "height": 800,
    "unit": "px",
    "background": "#FFFFFF"
  },
  "objects": [
    {
      "id": "circle-1",
      "type": "circle",
      "cx": 600,
      "cy": 400,
      "radius": 150,
      "fill": "#0052FF",
      "stroke": "#171717",
      "strokeWidth": 4
    }
  ]
}
```

The canonical schema is at `schemas/vector-scene.schema.json` and the complete example is at `examples/getting-started.json`.

## Project layout

```text
vector-engine/
├── apps/web                 Vue, TypeScript, CodeMirror, and browser adapter
├── engine/include           Public C++ API
├── engine/src               Parser, geometry, SVG, raster, encoders, and bindings
├── engine/tests             Catch2 tests
├── schemas                  Versioned JSON Schema
├── examples                 Example scenes
├── docs                     Architecture and format documentation
├── CMakeLists.txt           Native and WebAssembly entry point
├── CMakePresets.json        Reproducible build presets
└── package.json             Web workspace scripts
```

## Output behavior

- SVG preserves geometry and transformations and safely escapes text and attributes.
- PNG stores RGBA pixels and preserves transparency.
- JPEG composites transparency against the selected background and accepts quality from 1 to 100.
- BMP is encoded as bottom-up 24-bit BGR with four-byte row alignment and composites transparency against the selected background.

## Security limits

The default limits are:

| Resource | Limit |
|---|---:|
| JSON source | 4 MB |
| Document dimension | 16,384 px |
| Raster area | 67,108,864 pixels |
| Objects | 10,000 |
| Group depth | 32 |
| Path data | 1,000,000 characters |

The renderer accepts only declared scene properties, hexadecimal colors, supported path commands, and local text content. It does not load external resources.

## Documentation

- [Architecture](docs/architecture.md)
- [Scene format](docs/scene-format.md)
- [WebAssembly integration](docs/wasm.md)
- [Export formats](docs/export-formats.md)

## License

MIT
