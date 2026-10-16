# WebAssembly integration

## Build

Activate the Emscripten SDK and use the release preset:

```bash
source /path/to/emsdk/emsdk_env.sh
cmake --preset wasm-release
cmake --build --preset wasm-release
```

The post-build step copies the generated JavaScript loader and WebAssembly binary into `apps/web/public/wasm`.

## Public boundary

The Emscripten class exposes three operations:

- `validateJson(source)` returns a JSON validation result.
- `renderSvg(source, width, height, background)` returns an owned JavaScript string.
- `exportBinary(source, format, width, height, quality, background)` returns an owned `Uint8Array`.

The public surface is intentionally small. Vue components depend only on the TypeScript `EngineBackend` contract.

## Initialization

The adapter checks for the generated loader, injects it as a classic script, creates the module asynchronously, and constructs one engine instance. Initialization failures are caught and converted into the development fallback backend.

## Memory ownership

Input strings are copied into Emscripten-managed call arguments. SVG results are copied to JavaScript strings. Encoded C++ vectors are copied into a new JavaScript `Uint8Array` before the native result is destroyed. JavaScript never retains a view into growable WebAssembly memory.

The Embind engine instance is deleted when the backend is destroyed.

## Deployment

Serve `vector_engine.js` and `vector_engine.wasm` from the same `/wasm` directory. The adapter supplies `locateFile`, so the loader resolves the binary correctly under Vite development, preview, and static production hosting.

Use the correct MIME type for the binary:

```text
application/wasm
```

## Worker migration

The backend interface is serializable and can move behind a module worker. Source strings and SVG strings use structured cloning. Encoded `ArrayBuffer` values should be transferred rather than cloned. Vue and store code do not require changes when this optimization is introduced.
