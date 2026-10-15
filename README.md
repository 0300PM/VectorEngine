# Vector Engine

Browser-based vector graphics editor and renderer. The interface is built with Vue 3,
TypeScript and Tailwind CSS; rasterisation runs in a C++23 engine compiled to WebAssembly,
with a Canvas 2D fallback written in TypeScript. The project follows the plan described in
[docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

## Features

- Versioned document model (`VectorDocument` → layers → nodes) validated with Zod
- Native `.vex` project container (ZIP with `manifest.json`, `document.json`, previews, assets)
- Format registry with content sniffing: `.vex`, native JSON documents and legacy scene files
- Raster export to PNG, JPEG and WebP at scale presets or custom dimensions
- C++/WebAssembly rasteriser with analytic anti-aliasing, nonzero winding and round strokes
- Automatic fallback to Canvas 2D when the WebAssembly artifacts are unavailable
- Nothing is dropped silently: unsupported features and export losses are reported before saving
- Polish and English interface, undo/redo history, layer visibility and locking

## Requirements

- Node.js 22 or newer
- For the native engine tests: CMake 3.21+ and a C++23 compiler (GCC 12+, Clang 16+, MSVC 19.36+)
- For the WebAssembly build: an activated [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html)

## Getting started

```bash
npm install
npm run dev
```

The development server works without the WebAssembly build; the status line shows that the
Canvas 2D engine is active. To enable the native engine:

```bash
npm run build:wasm
```

This produces `public/wasm/vector_engine.js` and `public/wasm/vector_engine.wasm`, which are
loaded at runtime from `${BASE_URL}wasm/`.

## Scripts

| Script               | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `npm run dev`        | Vite development server                                |
| `npm run build`      | Type-check and production build                        |
| `npm run preview`    | Serve the production build                             |
| `npm run type-check` | `vue-tsc --build`                                      |
| `npm run lint`       | ESLint (including layering and no-comment conventions) |
| `npm run format`     | Prettier                                               |
| `npm run test`       | Vitest unit tests                                      |
| `npm run test:cpp`   | Configure, build and run the native C++ test suite     |
| `npm run build:wasm` | Compile the engine to WebAssembly into `public/wasm/`  |

## Architecture

```
src/core      framework-free domain: geometry, colours, document model, render scene, history
src/engine    VectorEngine interface, Canvas2DEngine, WasmEngine and the render protocol
src/formats   .vex container, document JSON, legacy scene import, raster encoding
src/app       Pinia stores and services that orchestrate core, engine and formats
src/ui        Vue components and composables
src/i18n      message catalogues (en, pl)
cpp           C++23 engine, C API, CMake project and native tests
```

Dependency rules are enforced by ESLint: `core` imports nothing from other layers or UI
frameworks, `engine` depends only on `core`, `formats` on `core` and `engine`, and `app` never
imports UI components.

### Render pipeline

1. `buildRenderScene` resolves units, layer visibility, nested transforms and opacity into a flat
   list of paths with resolved paints, collecting unsupported features (text, images, evenodd).
2. The scene is encoded into a `Float64Array` using the versioned protocol below and handed to
   the WebAssembly engine, or painted directly by `Canvas2DEngine`.
3. The resulting straight-alpha RGBA buffer is displayed on the preview canvas and encoded by
   the browser for raster export.

### Render protocol (version 1)

```
header   : version, background r g b a, itemCount
per item : a b c d e f, opacity,
           hasFill, fill r g b a,
           hasStroke, stroke r g b a, strokeWidth,
           verbCount, verbs...
verbs    : 0 move x y | 1 line x y | 2 quadratic x1 y1 x y | 3 cubic x1 y1 x2 y2 x y | 4 close
```

`vex_renderer_render` returns `0` on success, `1` unsupported protocol, `2` truncated buffer,
`3` invalid verb, `4` invalid renderer handle, `5` non-finite value.

### C API

```c
int32_t      vex_protocol_version(void);
VexRenderer* vex_renderer_create(uint32_t width, uint32_t height);
void         vex_renderer_destroy(VexRenderer* renderer);
int32_t      vex_renderer_render(VexRenderer* renderer, const double* commands, size_t length);
const uint8_t* vex_renderer_pixels(const VexRenderer* renderer);
uint32_t     vex_renderer_width(const VexRenderer* renderer);
uint32_t     vex_renderer_height(const VexRenderer* renderer);
```

## Document model

```json
{
  "schemaVersion": 1,
  "id": "doc_sample",
  "name": "Sample scene",
  "width": 900,
  "height": 560,
  "unit": "px",
  "colorSpace": "sRGB",
  "background": "#f8fafc",
  "layers": [
    {
      "id": "layer_main",
      "name": "Main",
      "visible": true,
      "locked": false,
      "opacity": 1,
      "children": [
        {
          "id": "rect_primary",
          "type": "rectangle",
          "x": 120,
          "y": 90,
          "width": 260,
          "height": 140,
          "cornerRadius": 18,
          "opacity": 1,
          "transform": { "a": 1, "b": 0, "c": 0, "d": 1, "e": 0, "f": 0 },
          "style": { "fill": { "color": "#2563eb" }, "stroke": { "color": "#1e3a8a", "width": 6 } }
        }
      ]
    }
  ],
  "assets": [],
  "metadata": { "createdAt": "2026-01-01T00:00:00.000Z", "generator": "vector-engine" },
  "exportSettings": { "dpi": 96 }
}
```

Node types: `rectangle`, `ellipse`, `path` (`M`/`L`/`Q`/`C`/`Z` commands), `text`, `image`,
`group`. Optional fields receive defaults during parsing; invalid colours, duplicate identifiers
and unknown schema versions are reported with their JSON path.

## The `.vex` container

| Entry                    | Content                                              |
| ------------------------ | ---------------------------------------------------- |
| `manifest.json`          | format version, generator, creation date, entry list |
| `document.json`          | the document in the current schema version           |
| `previews/thumbnail.png` | optional preview rendered at save time               |
| `assets/…`               | binary assets referenced by the document             |

Readers warn about unknown entries, missing assets and missing manifests; writers warn when
assets are referenced but not embedded. Raster export warns when transparency is flattened.

## Conventions

- Code contains no comments; intent is expressed through naming, types and tests
  (tool directives such as `@vite-ignore` are the only exception).
- Core modules are pure and framework-free; side effects live in `app` and `ui`.
- Every user-facing string goes through vue-i18n (`src/i18n/messages`).
- Warning and issue codes map one-to-one to translation keys.

## Continuous integration

`.github/ci.yml` defines a GitHub Actions workflow that runs linting, formatting, type-checking,
unit tests and the production build on Node 22, the native C++ test suite through CTest, and the
WebAssembly build with the Emscripten SDK. Move it to `.github/workflows/ci.yml` to activate it
(the file is kept outside `workflows/` because the automation token used to push this branch is
not allowed to create workflow files).
