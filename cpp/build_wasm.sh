#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
build_dir="$root/build-wasm"
output_dir="$root/../public/wasm"

command -v emcmake >/dev/null 2>&1 || {
  echo "emcmake not found. Activate the Emscripten SDK first (source emsdk_env.sh)." >&2
  exit 1
}

emcmake cmake -S "$root" -B "$build_dir" -DCMAKE_BUILD_TYPE=Release
cmake --build "$build_dir" --target vector_engine

mkdir -p "$output_dir"
cp "$build_dir/vector_engine.js" "$build_dir/vector_engine.wasm" "$output_dir/"

echo "WebAssembly build complete: public/wasm/vector_engine.{js,wasm}"
