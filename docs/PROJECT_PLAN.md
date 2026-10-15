# PROJECT PLAN — VECTOR ENGINE

## 1. Vision

Vector Engine is a modular vector graphics editor and rendering engine that runs in the browser.

The user interface is built with Vue 3, TypeScript, and Tailwind CSS, while performance-critical rasterization is handled by an engine written in C++23 and compiled to WebAssembly.

The core document model is independent of both the UI framework and the rendering engine. This allows the same document to be rendered, validated, migrated, and exported in multiple contexts, including the browser, tests, and command-line tools.

Primary objectives:

- A predictable, versioned document model.
- A native `.vex` project format that preserves complete document information.
- No silent data loss: every unsupported feature must be reported.
- A user interface available in Polish and English.
- Clean code without comments, where intent is expressed through naming and structure.

## 2. Architecture

### 2.1 Technology Stack

| Layer | Technology |
|---|---|
| UI | Vue 3 (Composition API, `<script setup>`) |
| Application State | Pinia, composables |
| Styling | Tailwind CSS 4 |
| Application Language | TypeScript (strict mode) |
| Engine | C++23 → WebAssembly (Emscripten) |
| Fallback | Canvas 2D in TypeScript |
| Validation | Zod |
| `.vex` Container | ZIP (fflate) |
| Quality Assurance | ESLint, Prettier, Vitest, CTest, GitHub Actions |

### 2.2 Modular Layers

```text
src/
  core/      document model, geometry, colors, rendering scene, history — no framework dependencies
  engine/    engine interface, Canvas2DEngine, WasmEngine, and binary protocol
  formats/   format adapters: .vex, document-json, legacy-scene, raster export
  app/       Pinia stores, services, sample document
  ui/        Vue components and composables
  i18n/      PL/EN dictionaries
cpp/
  include/vex/  engine headers (geometry, flattening, stroke, rasterizer, protocol, C API)
  src/          implementation
  tests/        native tests (CTest)
```

Dependency rules, enforced through ESLint:

- `core` must not import anything from higher-level layers or from Vue, Pinia, or vue-i18n.
- `engine` depends exclusively on `core`.
- `formats` depends on `core` and `engine`.
- `app` must not import UI components from `ui`.

### 2.3 C++ / WebAssembly Engine

The engine receives the scene as a flat `Float64Array` buffer using a versioned protocol. It flattens Bézier curves in local space, with a tolerance adjusted to the transformation scale, rasterizes fills using the nonzero winding rule with coverage-accumulation-based antialiasing, and constructs strokes as a union of segment quadrilaterals and round joins.

The output is an RGBA8 buffer using non-premultiplied alpha.

If the WebAssembly artifacts are unavailable, the application falls back to the Canvas 2D engine and informs the user through the status bar.

## 3. Data Format

### 3.1 Native `.vex` Format

The `.vex` format is a ZIP archive with a predefined structure:

```text
manifest.json      format version, generator, creation date, entry list
document.json      document using the current schema version
assets/            binary resources (images, fonts, color profiles)
previews/          preview thumbnails
```

The reader reports warnings for unknown entries, missing resources, and a missing manifest. The writer issues a warning when the document references resources that are not embedded in the archive.

### 3.2 Format Adapters

The format registry selects a reader based on the file extension and file contents.

Each adapter returns a document together with a list of warnings (`FormatWarning`). Before any export, a write operation can be preceded by an inspection step (`inspect`) that identifies potential data loss.

### 3.3 Document Model

```text
VectorDocument { schemaVersion, id, name, width, height, unit, colorSpace, background,
                 layers[], assets[], metadata, exportSettings }
Layer          { id, name, visible, locked, opacity, children[] }
VectorNode     rectangle | ellipse | path | text | image | group
NodeBase       { id, name?, opacity, transform: Matrix2D }
Matrix2D       { a, b, c, d, e, f }
PaintStyle     { fill?: { color }, stroke?: { color, width } }
```

The schema is versioned. Documents created with older versions are processed through migration routines, while invalid data is reported as a list of issues containing the affected path and the reason for each issue.

### 3.4 No Silent Data Loss

Text, images, and the even-odd fill rule are currently beyond the capabilities of the rasterization engine.

Such nodes remain in the document, and the UI displays a list of elements omitted during rendering.

When exporting to formats without an alpha channel, the application warns the user that transparency will be flattened.
