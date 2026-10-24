# Architecture

## Processing pipeline

```text
JSON source snapshot
  → structural validation (Ajv Draft 2020-12 + C++23 JSON parser)
  → semantic validation (unique IDs, layers, workspaces, gradients, memory limits)
  → target scope extraction (scene / selection / group / layer / objects / workspace)
  → analytical tight bounding box & viewport resolution (contain / cover / stretch + margin + clip)
  → SVG serializer (with optional minification) or 4x subpixel scanline RGBA rasterizer
  → PNG, JPEG, BMP (24-bit BGR / 32-bit BGRA), or PKZIP archive packaging
```

The UI does not depend on C++ implementation details. It communicates through the `EngineBackend` TypeScript contract and the `apps/web/src/export` service pipeline.

## Layers

### UI (`apps/web/src/components`)

- `AppHeader.vue` manages document naming, JSON import, scene reset, and single-click export.
- `JsonEditor.vue` provides a CodeMirror 6 JSON editor with inline validation diagnostics.
- `PreviewPanel.vue` renders the live scene with zoom controls and an independent editor canvas backdrop (`Grid`, `Light`, `White`, `Dark`) decoupled from the export background.
- `ExportPanel.vue` exposes the 7-stage export workflow (`1. Target`, `2. Format`, `3. Dimensions`, `4. Background`, `5. Advanced`, `6. Preview`, `7. Export`) supporting both single-file and multi-item batch/ZIP pipelines with live cancellation.

### Export Orchestration (`apps/web/src/export`)

- `bounds.ts`: affine matrix composition, path Bezier flattening bounds, scoped tree pruning preserving parent transforms and draw order, and viewport resolution.
- `validation.ts`: strict preflight validation of dimensions, pixel counts, memory budgets, HEX colors, JPEG quality, and target references.
- `filename.ts`: safe template expansion (`{document}_{object}_{scale}`, `{layer}`, `{width}`, `{height}`, `{format}`, `{index}`) and case-insensitive filename collision deduplication.
- `sizeEstimator.ts`: fast pre-export file byte and working RAM estimation, alpha transparency diagnostics, and downscaled preview thumbnail calculation (`<= 320 px`).
- `zipWriter.ts`: zero-dependency PKZIP archive writer and reader with IEEE CRC-32 checksums and automatic `STORE` / `DEFLATE` selection.
- `exportService.ts` & `batchExporter.ts`: immutable source snapshot isolation, `AbortSignal` cancellation, per-item batch overrides, and structured `BatchExportReport` generation.

### Web Worker & WebAssembly Adapter (`apps/web/src/engine`)

- `workerBackend.ts` & `exportWorker.ts`: run `WasmBackend` off the main UI thread, transfer encoded binaries across thread boundaries via zero-copy `Transferable` `ArrayBuffer`s, and terminate hung workers immediately on `AbortSignal.abort()` before respawning a clean worker instance.
- `wasmBackend.ts`: bridges TypeScript to the compiled `-O3` C++23 `vector_engine.wasm` reactor (`validateJson`, `renderScopedSvg`, `exportScopedMeta`, `takeLastBytes`, `measureBounds`).
- `browserBackend.ts`: API-compatible fallback implementation.

### Native C++23 Core (`engine/`)

- `src/parser.cpp` & `src/bounds.cpp`: parse scenes, layers, workspaces, and linear/radial gradients; compute exact transformed stroke-aware bounding boxes and prune scene trees without losing ancestor transforms or draw order.
- `src/svg_renderer.cpp`: emits accessible or minified SVG markup with `<defs>` gradients, `<clipPath>`, `mix-blend-mode`, and `preserveAspectRatio`.
- `src/rasterizer.cpp`: rasterizes vector geometry, linear/radial gradients (`pad`, `reflect`, `repeat`), strokes, and clip regions into straight-alpha RGBA buffers within strict memory budgets.
- `src/encoders.cpp`: encodes lossless RGBA PNG, adjustable-quality baseline DCT JPEG, 24-bit bottom-up BGR BMP, and 32-bit BGRA BMP.
