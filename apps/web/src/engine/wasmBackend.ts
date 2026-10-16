import type {
  EngineBackend,
  ExportOptions,
  ExportResult,
  RenderOptions,
  RenderResult,
  ValidationResult,
} from '@/types/engine'
import { VectorEngineError } from './errors'

type WasmEngineInstance = {
  validateJson(source: string): string
  renderSvg(source: string, width: number, height: number, background: string): string
  exportBinary(source: string, format: string, width: number, height: number, quality: number, background: string): Uint8Array
  delete(): void
}

type WasmModule = {
  Engine: new () => WasmEngineInstance
}

type WasmFactory = (options: { locateFile: (file: string) => string }) => Promise<WasmModule>

declare global {
  interface Window {
    createVectorEngineModule?: WasmFactory
  }
}

const loadFactory = async (): Promise<WasmFactory> => {
  if (window.createVectorEngineModule) {
    return window.createVectorEngineModule
  }

  const response = await fetch('/wasm/vector_engine.js', { method: 'HEAD', cache: 'no-store' })
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok || !contentType.includes('javascript')) {
    throw new VectorEngineError('wasm.unavailable', 'WebAssembly artifacts are not installed')
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/wasm/vector_engine.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new VectorEngineError('wasm.load', 'Failed to load the WebAssembly module'))
    document.head.append(script)
  })

  if (!window.createVectorEngineModule) {
    throw new VectorEngineError('wasm.factory', 'The WebAssembly module did not expose its factory')
  }
  return window.createVectorEngineModule
}

const mimeByFormat = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
} as const

const extensionByFormat = {
  svg: 'svg',
  png: 'png',
  jpeg: 'jpg',
  bmp: 'bmp',
} as const

export class WasmBackend implements EngineBackend {
  readonly name = 'C++23 · WebAssembly'
  private readonly instance: WasmEngineInstance

  private constructor(instance: WasmEngineInstance) {
    this.instance = instance
  }

  static async create(): Promise<WasmBackend> {
    const factory = await loadFactory()
    const module = await factory({
      locateFile: (file) => `/wasm/${file.split('/').at(-1) ?? file}`,
    })
    return new WasmBackend(new module.Engine())
  }

  async validate(source: string): Promise<ValidationResult> {
    return JSON.parse(this.instance.validateJson(source)) as ValidationResult
  }

  async renderSvg(source: string, options: RenderOptions = {}): Promise<RenderResult> {
    const validation = await this.validate(source)
    if (!validation.valid || !validation.scene) {
      throw new VectorEngineError('validation.failed', 'Scene validation failed', validation.issues)
    }
    const width = Math.round(options.width ?? validation.scene.document.width)
    const height = Math.round(options.height ?? validation.scene.document.height)
    const background = options.background === undefined
      ? '__DOCUMENT__'
      : options.background ?? '__TRANSPARENT__'
    const svg = this.instance.renderSvg(source, width, height, background)
    return { svg, width, height }
  }

  async export(source: string, options: ExportOptions): Promise<ExportResult> {
    const background = options.background ?? '__TRANSPARENT__'
    const value = this.instance.exportBinary(
      source,
      options.format,
      options.width,
      options.height,
      options.quality,
      background,
    )
    const data = new Uint8Array(value)
    return {
      data,
      mimeType: mimeByFormat[options.format],
      extension: extensionByFormat[options.format],
    }
  }

  destroy(): void {
    this.instance.delete()
  }
}
