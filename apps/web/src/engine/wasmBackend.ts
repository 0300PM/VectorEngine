import type {
  BackendExportOptions,
  BackendExportResult,
  EngineBackend,
  ExportRegion,
  ExportTarget,
  RenderOptions,
  RenderResult,
  ValidationIssue,
  ValidationResult,
} from '@/types/engine'
import { VectorEngineError } from './errors'

interface RawWasmExports {
  memory: WebAssembly.Memory
  _initialize?: () => void
  ve_alloc: (size: number) => number
  ve_free: (ptr: number) => void
  ve_validate: (ptr: number, len: number) => number
  ve_render_scoped: (srcPtr: number, srcLen: number, optPtr: number, optLen: number) => number
  ve_export_scoped: (srcPtr: number, srcLen: number, optPtr: number, optLen: number) => number
  ve_measure_bounds: (srcPtr: number, srcLen: number, optPtr: number, optLen: number) => number
  ve_text_ptr: () => number
  ve_text_len: () => number
  ve_binary_ptr: () => number
  ve_binary_len: () => number
  ve_clear_buffers: () => void
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8')

const createWasiImports = (getMemory: () => WebAssembly.Memory | null): WebAssembly.ModuleImports => {
  const handlers: Record<string, (...args: number[]) => number> = {
    args_get: () => 0,
    args_sizes_get: (countPtr = 0, bufSizePtr = 0) => {
      const mem = getMemory()
      if (mem) {
        const view = new DataView(mem.buffer)
        view.setUint32(countPtr, 0, true)
        view.setUint32(bufSizePtr, 0, true)
      }
      return 0
    },
    environ_get: () => 0,
    environ_sizes_get: (countPtr = 0, bufSizePtr = 0) => {
      const mem = getMemory()
      if (mem) {
        const view = new DataView(mem.buffer)
        view.setUint32(countPtr, 0, true)
        view.setUint32(bufSizePtr, 0, true)
      }
      return 0
    },
    clock_time_get: () => 0,
    fd_close: () => 0,
    fd_fdstat_get: () => 0,
    fd_seek: () => 0,
    fd_write: () => 0,
    proc_exit: () => 0,
    random_get: (ptr = 0, len = 0) => {
      const mem = getMemory()
      if (mem) {
        new Uint8Array(mem.buffer, ptr, len).fill(0)
      }
      return 0
    },
  }

  return new Proxy(handlers, {
    get(target, key: string) {
      return target[key] ?? (() => 0)
    },
  })
}

const instantiateReactor = async (baseUrl: string, wasmBinary?: ArrayBuffer): Promise<RawWasmExports> => {
  let memoryRef: WebAssembly.Memory | null = null
  const imports: WebAssembly.Imports = {
    wasi_snapshot_preview1: createWasiImports(() => memoryRef),
  }

  let instance: WebAssembly.Instance
  if (wasmBinary) {
    const instantiated = await WebAssembly.instantiate(wasmBinary, imports)
    instance = instantiated.instance
  } else {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    const relativeWasm = `${normalizedBase}wasm/vector_engine.wasm`
    const origin = typeof globalThis.location?.origin === 'string' && globalThis.location.origin !== 'null'
      ? globalThis.location.origin
      : undefined
    const wasmUrl = origin ? new URL(relativeWasm, origin).href : relativeWasm

    const response = await fetch(wasmUrl)
    if (!response.ok) {
      throw new VectorEngineError('wasm.unavailable', `Failed to fetch WebAssembly binary (${response.status})`)
    }

    if (typeof WebAssembly.instantiateStreaming === 'function') {
      try {
        const streamed = await WebAssembly.instantiateStreaming(response.clone(), imports)
        instance = streamed.instance
      } catch {
        const bytes = await response.arrayBuffer()
        const fallback = await WebAssembly.instantiate(bytes, imports)
        instance = fallback.instance
      }
    } else {
      const bytes = await response.arrayBuffer()
      const instantiated = await WebAssembly.instantiate(bytes, imports)
      instance = instantiated.instance
    }
  }

  const exports = instance.exports as unknown as RawWasmExports
  memoryRef = exports.memory
  exports._initialize?.()
  return exports
}

const serializeScopedOptions = (options: RenderOptions | BackendExportOptions): string => {
  const payload: Record<string, unknown> = {
    scale: options.scale ?? 1,
    width: options.width ?? 0,
    height: options.height ?? 0,
    margin: options.margin ?? 0,
    fitMode: options.fitMode ?? (options.preserveAspectRatio === false ? 'stretch' : 'contain'),
    preserveAspectRatio: options.preserveAspectRatio ?? true,
    includeHidden: Boolean(options.includeHidden),
    trimToBounds: Boolean(options.trimToBounds),
    clipToBounds: Boolean(options.clipToBounds),
    minifySvg: Boolean(options.minifySvg),
  }

  if ('format' in options) {
    payload.format = options.format
    payload.quality = options.quality
    payload.bmpBitDepth = options.bmpBitDepth ?? 24
    if (options.maxMemoryBytes !== undefined) {
      payload.maxMemoryBytes = options.maxMemoryBytes
    }
    if (options.qualityExplicit) {
      payload.qualityExplicit = true
    }
    if (options.minifyExplicit) {
      payload.minifyExplicit = true
    }
  }

  if (options.background === null || options.background === 'transparent') {
    payload.background = 'transparent'
  } else if (options.background === undefined || options.background === 'document') {
    payload.background = 'document'
  } else if (typeof options.background === 'object') {
    payload.background = { color: options.background.color }
  } else {
    payload.background = options.background
  }

  if (options.target) {
    payload.target = options.target
  }

  return JSON.stringify(payload)
}

export class WasmBackend implements EngineBackend {
  readonly name = 'C++23 · WebAssembly'

  constructor(private readonly exports: RawWasmExports) {}

  static async create(
    baseUrl = '/',
    wasmBinary?: ArrayBuffer,
  ): Promise<WasmBackend> {
    const rawExports = await instantiateReactor(baseUrl, wasmBinary)
    return new WasmBackend(rawExports)
  }

  private allocUtf8(value: string): { ptr: number; len: number } {
    const encoded = textEncoder.encode(value)
    const ptr = this.exports.ve_alloc(encoded.byteLength)
    new Uint8Array(this.exports.memory.buffer, ptr, encoded.byteLength).set(encoded)
    return { ptr, len: encoded.byteLength }
  }

  private readText(): string {
    const ptr = this.exports.ve_text_ptr()
    const len = this.exports.ve_text_len()
    return textDecoder.decode(new Uint8Array(this.exports.memory.buffer, ptr, len))
  }

  private readBytes(): Uint8Array {
    const ptr = this.exports.ve_binary_ptr()
    const len = this.exports.ve_binary_len()
    const out = new Uint8Array(len)
    if (len > 0) {
      out.set(new Uint8Array(this.exports.memory.buffer, ptr, len))
    }
    this.exports.ve_clear_buffers()
    return out
  }

  async validate(source: string): Promise<ValidationResult> {
    const src = this.allocUtf8(source)
    let rawText = ''
    try {
      this.exports.ve_validate(src.ptr, src.len)
      rawText = this.readText()
    } finally {
      this.exports.ve_free(src.ptr)
      this.exports.ve_clear_buffers()
    }

    const raw = JSON.parse(rawText) as ValidationResult
    if (!raw.valid) {
      return raw
    }
    const scene = JSON.parse(source) as ValidationResult['scene']
    return {
      valid: true,
      issues: raw.issues,
      ...(scene ? { scene } : {}),
    }
  }

  async measureBounds(source: string, target: ExportTarget, includeHidden = false): Promise<ExportRegion | null> {
    const src = this.allocUtf8(source)
    const opt = this.allocUtf8(JSON.stringify({ target, includeHidden }))
    let rawText = ''
    try {
      this.exports.ve_measure_bounds(src.ptr, src.len, opt.ptr, opt.len)
      rawText = this.readText()
    } finally {
      this.exports.ve_free(src.ptr)
      this.exports.ve_free(opt.ptr)
      this.exports.ve_clear_buffers()
    }

    const raw = JSON.parse(rawText) as {
      ok: boolean
      empty?: boolean
      bounds?: ExportRegion
      issues?: ValidationIssue[]
    }
    if (!raw.ok) {
      const first = raw.issues?.[0]
      throw new VectorEngineError(
        first?.code ?? 'wasm.bounds',
        first?.message ?? 'Bounds measurement failed',
        raw.issues ?? [],
      )
    }
    return raw.empty ? null : (raw.bounds ?? null)
  }

  async renderSvg(source: string, options: RenderOptions = {}): Promise<RenderResult> {
    const validation = await this.validate(source)
    if (!validation.valid || !validation.scene) {
      throw new VectorEngineError('validation.failed', 'Scene validation failed', validation.issues)
    }

    const src = this.allocUtf8(source)
    const opt = this.allocUtf8(serializeScopedOptions(options))
    let rawText = ''
    try {
      this.exports.ve_render_scoped(src.ptr, src.len, opt.ptr, opt.len)
      rawText = this.readText()
    } finally {
      this.exports.ve_free(src.ptr)
      this.exports.ve_free(opt.ptr)
      this.exports.ve_clear_buffers()
    }

    const response = JSON.parse(rawText) as {
      ok: boolean
      svg?: string
      width?: number
      height?: number
      bounds?: ExportRegion
      issues?: ValidationIssue[]
    }
    if (!response.ok || response.svg === undefined) {
      const first = response.issues?.[0]
      throw new VectorEngineError(
        first?.code ?? 'wasm.render',
        first?.message ?? 'WebAssembly SVG rendering failed',
        response.issues ?? validation.issues,
      )
    }
    return {
      svg: response.svg,
      width: response.width ?? validation.scene.document.width,
      height: response.height ?? validation.scene.document.height,
      ...(response.bounds ? { bounds: response.bounds } : {}),
      issues: response.issues ?? validation.issues,
    }
  }

  async export(source: string, options: BackendExportOptions): Promise<BackendExportResult> {
    const validation = await this.validate(source)
    if (!validation.valid || !validation.scene) {
      throw new VectorEngineError('validation.failed', 'Scene validation failed', validation.issues)
    }

    const src = this.allocUtf8(source)
    const opt = this.allocUtf8(serializeScopedOptions(options))
    let rawMeta = ''
    try {
      this.exports.ve_export_scoped(src.ptr, src.len, opt.ptr, opt.len)
      rawMeta = this.readText()
    } finally {
      this.exports.ve_free(src.ptr)
      this.exports.ve_free(opt.ptr)
    }

    const meta = JSON.parse(rawMeta) as {
      ok: boolean
      mimeType?: string
      extension?: string
      width?: number
      height?: number
      hasAlpha?: boolean
      bounds?: ExportRegion
      issues?: ValidationIssue[]
    }
    if (!meta.ok) {
      this.exports.ve_clear_buffers()
      const first = meta.issues?.[0]
      throw new VectorEngineError(
        first?.code ?? 'wasm.export',
        first?.message ?? 'WebAssembly export failed',
        meta.issues ?? validation.issues,
      )
    }

    const data = this.readBytes()
    return {
      data,
      mimeType: meta.mimeType ?? (options.format === 'svg' ? 'image/svg+xml' : `image/${options.format}`),
      extension: meta.extension ?? (options.format === 'jpeg' ? 'jpg' : options.format),
      width: meta.width ?? validation.scene.document.width,
      height: meta.height ?? validation.scene.document.height,
      hasAlpha: Boolean(meta.hasAlpha),
      ...(meta.bounds ? { bounds: meta.bounds } : {}),
      issues: meta.issues ?? validation.issues,
    }
  }

  destroy(): void {
    this.exports.ve_clear_buffers()
  }

  dispose(): void {
    this.exports.ve_clear_buffers()
  }
}
