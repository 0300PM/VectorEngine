# WebAssembly artifacts

This directory receives the compiled engine (`vector_engine.js` and `vector_engine.wasm`).
The files are build outputs and are intentionally not committed.

Build them with an activated Emscripten SDK:

```bash
npm run build:wasm
```

When the artifacts are missing the application automatically falls back to the
TypeScript Canvas 2D engine and reports the reason in the status line.
