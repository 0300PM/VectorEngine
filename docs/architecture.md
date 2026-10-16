# Architecture

## Processing pipeline

```text
JSON source
  → structural validation
  → semantic validation and resource checks
  → normalized scene graph
  → SVG renderer or RGBA rasterizer
  → PNG, JPEG, or BMP encoder
```

The UI does not depend on C++ implementation details. It communicates through the `EngineBackend` TypeScript interface and receives validation objects, SVG strings, or owned byte arrays.

## Layers

### UI

The Vue application owns editor state, preview controls, import and download flows, export settings, responsive navigation, and status messages. Rendering work is debounced so rapid editor updates do not create an unbounded queue. Ajv compiles the canonical JSON Schema into a checked-in standalone validator module during development and production builds, avoiding runtime code generation.

### Adapter

`apps/web/src/engine/createBackend.ts` initializes the Emscripten module asynchronously. The adapter copies encoded output into a JavaScript `Uint8Array`, so no C++ memory remains borrowed after a call. If WebAssembly artifacts are not present in a development checkout, the API-compatible browser backend provides immediate local preview and export.

### Core engine

The C++ public API is under `engine/include/vector_engine`. `Engine` exposes validation, SVG rendering, and binary export through result objects with explicit issues. Parsing produces a normalized scene graph composed of typed geometry, style, color, and affine matrix values.

### Rendering backends

SVG generation, rasterization, and encoding are separate modules:

- `src/svg` serializes vector geometry and escapes XML values.
- `src/raster` converts normalized geometry into a common straight-alpha RGBA buffer.
- `src/encoders` converts the RGBA buffer to PNG, JPEG, or BMP.

The native CLI and Emscripten binding link the same `vector_engine_core` target.

## Scene graph

A scene contains a document and ordered nodes. Every node stores:

- A unique identifier
- A concrete geometry variant
- Normalized style values
- An affine transform matrix
- Visibility and opacity

Groups contain child nodes and compose transforms and opacity during traversal. Draw order follows array order.

## Error model

Every issue has a stable code, message, JSON path, and severity. Invalid input does not produce a partial export. The browser keeps the last valid preview visible while marking it as stale, which lets users correct a document without losing visual context.

## Determinism

Object order, attribute order, numeric formatting, color normalization, and encoder settings are stable. The engine does not use random values, current time, network content, or platform-specific external resources.

## Performance model

- JSON source and scene complexity are bounded before rendering.
- Parsed values are normalized once per engine operation.
- Geometry curves and arcs are flattened with bounded subdivision.
- Raster fill uses scanline intersections with four subpixel coverage samples.
- Binary data crosses the WebAssembly boundary once as a typed array.
- The UI debounces live rendering and discards stale asynchronous results.

A worker can be introduced behind the same adapter interface for workloads that exceed the interactive threshold without changing Vue components or the C++ API.
