import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(rootDir, 'apps/web/public/wasm')
const wasmPath = path.join(outputDir, 'vector_engine.wasm')
const loaderPath = path.join(outputDir, 'vector_engine.js')

await mkdir(outputDir, { recursive: true })

if (process.env.EMSDK) {
  execFileSync('cmake', ['--preset', 'wasm-release'], { cwd: rootDir, stdio: 'inherit' })
  execFileSync('cmake', ['--build', '--preset', 'wasm-release'], { cwd: rootDir, stdio: 'inherit' })
  process.exit(0)
}

const nlohmannInclude = path.join(rootDir, 'build/native-debug/_deps/nlohmann_json-src/include')
const stbInclude = path.join(rootDir, 'build/native-debug/_deps/stb-src')

const sources = [
  'engine/src/core/engine.cpp',
  'engine/src/json/parser.cpp',
  'engine/src/geometry/bounds.cpp',
  'engine/src/geometry/path.cpp',
  'engine/src/geometry/transform.cpp',
  'engine/src/scene/types.cpp',
  'engine/src/svg/svg_renderer.cpp',
  'engine/src/raster/rasterizer.cpp',
  'engine/src/encoders/encoders.cpp',
  'engine/src/encoders/stb_image_write.cpp',
  'engine/src/bindings/wasm_reactor.cpp',
]

const exportedFunctions = [
  've_alloc',
  've_free',
  've_text_ptr',
  've_text_len',
  've_binary_ptr',
  've_binary_len',
  've_clear_buffers',
  've_validate',
  've_render_scoped',
  've_export_scoped',
  've_measure_bounds',
]

execFileSync(
  'python3',
  [
    '-m',
    'ziglang',
    'c++',
    '-target',
    'wasm32-wasi',
    '-mexec-model=reactor',
    '-std=c++23',
    '-O3',
    '-ffunction-sections',
    '-fdata-sections',
    '-DJSON_NOEXCEPTION',
    '-fno-exceptions',
    `-I${path.join(rootDir, 'engine/include')}`,
    `-I${nlohmannInclude}`,
    `-I${stbInclude}`,
    ...sources,
    ...exportedFunctions.map((fn) => `-Wl,--export=${fn}`),
    '-Wl,--gc-sections',
    '-Wl,--strip-all',
    '-o',
    wasmPath,
  ],
  { cwd: rootDir, stdio: 'inherit' },
)

const loaderSource = `var createVectorEngineModule = (() => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder('utf-8')

  const noopWasi = new Proxy(
    {
      args_get: () => 0,
      args_sizes_get: (countPtr, bufSizePtr, mem) => {
        const view = new DataView(mem.buffer)
        view.setUint32(countPtr, 0, true)
        view.setUint32(bufSizePtr, 0, true)
        return 0
      },
      environ_get: () => 0,
      environ_sizes_get: (countPtr, bufSizePtr, mem) => {
        const view = new DataView(mem.buffer)
        view.setUint32(countPtr, 0, true)
        view.setUint32(bufSizePtr, 0, true)
        return 0
      },
      clock_time_get: () => 0,
      fd_close: () => 0,
      fd_fdstat_get: () => 0,
      fd_seek: () => 0,
      fd_write: () => 0,
      proc_exit: () => 0,
      random_get: (ptr, len, mem) => {
        new Uint8Array(mem.buffer, ptr, len).fill(0)
        return 0
      },
    },
    {
      get(target, key) {
        return target[key] ?? (() => 0)
      },
    },
  )

  return async function createModule(options = {}) {
    let memoryRef = null
    const wasiImports = new Proxy(
      {},
      {
        get(_target, key) {
          return (...args) => noopWasi[key](...args, memoryRef)
        },
      },
    )

    let instanceResult
    if (options.wasmBinary) {
      instanceResult = await WebAssembly.instantiate(options.wasmBinary, {
        wasi_snapshot_preview1: wasiImports,
      })
    } else {
      const wasmUrl = options.locateFile ? options.locateFile('vector_engine.wasm') : '/wasm/vector_engine.wasm'
      const response = await fetch(wasmUrl)
      if (!response.ok) {
        throw new Error('Failed to load WebAssembly binary')
      }
      if (WebAssembly.instantiateStreaming) {
        try {
          instanceResult = await WebAssembly.instantiateStreaming(response.clone(), {
            wasi_snapshot_preview1: wasiImports,
          })
        } catch {
          const bytes = await response.arrayBuffer()
          instanceResult = await WebAssembly.instantiate(bytes, {
            wasi_snapshot_preview1: wasiImports,
          })
        }
      } else {
        const bytes = await response.arrayBuffer()
        instanceResult = await WebAssembly.instantiate(bytes, {
          wasi_snapshot_preview1: wasiImports,
        })
      }
    }

    const exports = instanceResult.instance.exports
    memoryRef = exports.memory
    if (typeof exports._initialize === 'function') {
      exports._initialize()
    }

    const writeString = (value) => {
      const encoded = encoder.encode(value)
      const ptr = exports.ve_alloc(encoded.byteLength)
      new Uint8Array(exports.memory.buffer, ptr, encoded.byteLength).set(encoded)
      return { ptr, len: encoded.byteLength }
    }

    const readTextOutput = () => {
      const ptr = exports.ve_text_ptr()
      const len = exports.ve_text_len()
      return decoder.decode(new Uint8Array(exports.memory.buffer, ptr, len))
    }

    const readBinaryOutput = () => {
      const ptr = exports.ve_binary_ptr()
      const len = exports.ve_binary_len()
      const out = new Uint8Array(len)
      if (len > 0) {
        out.set(new Uint8Array(exports.memory.buffer, ptr, len))
      }
      exports.ve_clear_buffers()
      return out
    }

    class Engine {
      validateJson(source) {
        const src = writeString(source)
        try {
          exports.ve_validate(src.ptr, src.len)
          return readTextOutput()
        } finally {
          exports.ve_free(src.ptr)
          exports.ve_clear_buffers()
        }
      }

      renderScopedSvg(source, optionsJson) {
        const src = writeString(source)
        const opt = writeString(optionsJson)
        try {
          exports.ve_render_scoped(src.ptr, src.len, opt.ptr, opt.len)
          return readTextOutput()
        } finally {
          exports.ve_free(src.ptr)
          exports.ve_free(opt.ptr)
          exports.ve_clear_buffers()
        }
      }

      exportScopedMeta(source, optionsJson) {
        const src = writeString(source)
        const opt = writeString(optionsJson)
        try {
          exports.ve_export_scoped(src.ptr, src.len, opt.ptr, opt.len)
          return readTextOutput()
        } finally {
          exports.ve_free(src.ptr)
          exports.ve_free(opt.ptr)
        }
      }

      takeLastBytes() {
        return readBinaryOutput()
      }

      measureBounds(source, optionsJson) {
        const src = writeString(source)
        const opt = writeString(optionsJson)
        try {
          exports.ve_measure_bounds(src.ptr, src.len, opt.ptr, opt.len)
          return readTextOutput()
        } finally {
          exports.ve_free(src.ptr)
          exports.ve_free(opt.ptr)
          exports.ve_clear_buffers()
        }
      }

      renderSvg(source, width, height, background) {
        const bgValue = background === '__DOCUMENT__'
          ? 'document'
          : background === '__TRANSPARENT__'
            ? 'transparent'
            : { color: background }
        const response = JSON.parse(this.renderScopedSvg(source, JSON.stringify({
          width,
          height,
          background: bgValue,
        })))
        if (!response.ok) {
          const message = response.issues?.find((item) => item.severity === 'error')?.message ?? 'SVG rendering failed'
          throw new Error(message)
        }
        return response.svg
      }

      exportBinary(source, format, width, height, quality, background) {
        const bgValue = background === '__DOCUMENT__'
          ? 'document'
          : background === '__TRANSPARENT__'
            ? 'transparent'
            : { color: background }
        const meta = JSON.parse(this.exportScopedMeta(source, JSON.stringify({
          format,
          width,
          height,
          quality,
          background: bgValue,
        })))
        if (!meta.ok) {
          const message = meta.issues?.find((item) => item.severity === 'error')?.message ?? 'Image export failed'
          throw new Error(message)
        }
        return this.takeLastBytes()
      }

      delete() {
        exports.ve_clear_buffers()
      }
    }

    return { Engine }
  }
})()
globalThis.createVectorEngineModule = createVectorEngineModule
`

await writeFile(loaderPath, loaderSource, 'utf8')
