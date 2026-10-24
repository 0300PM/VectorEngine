# WebAssembly integration

## Build

Compile the native C++23 engine (`engine/src/*.cpp` + `engine/src/wasm_reactor.cpp`) into optimized `-O3` WebAssembly artifacts via:

```bash
npm run wasm:build
npm run verify:wasm
```

`scripts/build-wasm.mjs` compiles all C++23 engine translation units with `-std=c++23 -O3 -ffunction-sections -fdata-sections -Wl,--gc-sections -Wl,--strip-all` targeting `wasm32-wasi` reactor mode and emits `apps/web/public/wasm/vector_engine.wasm` alongside the CSP-compliant JavaScript loader `apps/web/public/wasm/vector_engine.js`.

## Public boundary

The WebAssembly engine instance exposes:

- `validateJson(source)` — validates structural schema, unique identifiers, gradients, layers, workspaces, and limits.
- `measureBounds(source, optionsJson)` — computes exact analytical bounding boxes across composed affine transforms and strokes.
- `renderScopedSvg(source, optionsJson)` — extracts target scope, resolves viewport/margin/clip/fit options, and returns SVG markup plus metadata.
- `exportScopedMeta(source, optionsJson)` & `takeLastBytes()` — rasterizes/encodes SVG, PNG, JPEG, BMP 24-bit, or BMP 32-bit outputs and copies owned `Uint8Array` bytes across linear memory once.
- `renderSvg(...)` & `exportBinary(...)` — legacy convenience entrypoints.

## Dedicated Worker Execution

`WorkerBackend` spawns `exportWorker.ts` off the main UI thread:

- Encoded byte buffers cross back to the main thread via zero-copy `Transferable` `ArrayBuffer` transfers.
- Aborting an `AbortSignal` terminates an in-flight worker immediately without blocking UI responsiveness and transparently initializes a clean worker on the next operation.
