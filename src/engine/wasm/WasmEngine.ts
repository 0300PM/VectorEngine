import type { RenderScene } from '@/core/scene'
import {
  EngineUnavailableError,
  RenderFailedError,
  type RenderResult,
  type VectorEngine,
} from '../types'
import { loadVectorEngineModule, type VectorEngineModule } from './module'
import { encodeRenderScene, PROTOCOL_VERSION, RenderStatus, renderStatusLabel } from './protocol'

type RendererHandle = { readonly pointer: number; readonly width: number; readonly height: number }

const BYTES_PER_DOUBLE = Float64Array.BYTES_PER_ELEMENT
const CHANNELS = 4

export class WasmEngine implements VectorEngine {
  readonly kind = 'wasm'

  readonly #module: VectorEngineModule
  #renderer: RendererHandle | undefined

  private constructor(module: VectorEngineModule) {
    this.#module = module
  }

  static async load(glueUrl: string): Promise<WasmEngine> {
    let module: VectorEngineModule
    try {
      module = await loadVectorEngineModule(glueUrl)
    } catch (cause) {
      throw new EngineUnavailableError('wasm', cause)
    }
    const version = module._vex_protocol_version()
    if (version !== PROTOCOL_VERSION) {
      throw new EngineUnavailableError(
        'wasm',
        new Error(`Protocol mismatch: module ${version}, application ${PROTOCOL_VERSION}`),
      )
    }
    return new WasmEngine(module)
  }

  render(scene: RenderScene): Promise<RenderResult> {
    const renderer = this.#acquireRenderer(scene.width, scene.height)
    const commands = encodeRenderScene(scene)
    const pointer = this.#module._malloc(commands.byteLength)
    if (pointer === 0) {
      return Promise.reject(new RenderFailedError(this.kind, -1, 'Out of memory'))
    }

    try {
      this.#module.HEAPF64.set(commands, pointer / BYTES_PER_DOUBLE)
      const status = this.#module._vex_renderer_render(renderer.pointer, pointer, commands.length)
      if (status !== RenderStatus.ok) {
        return Promise.reject(new RenderFailedError(this.kind, status, renderStatusLabel(status)))
      }
      const pixelPointer = this.#module._vex_renderer_pixels(renderer.pointer)
      const byteLength = renderer.width * renderer.height * CHANNELS
      const pixels = new Uint8ClampedArray(
        this.#module.HEAPU8.buffer,
        pixelPointer,
        byteLength,
      ).slice()
      return Promise.resolve({
        width: renderer.width,
        height: renderer.height,
        pixels,
        engine: this.kind,
      })
    } finally {
      this.#module._free(pointer)
    }
  }

  dispose(): void {
    if (this.#renderer) {
      this.#module._vex_renderer_destroy(this.#renderer.pointer)
      this.#renderer = undefined
    }
  }

  #acquireRenderer(width: number, height: number): RendererHandle {
    const current = this.#renderer
    if (current && current.width === width && current.height === height) {
      return current
    }
    this.dispose()
    const pointer = this.#module._vex_renderer_create(width, height)
    if (pointer === 0) {
      throw new RenderFailedError(
        this.kind,
        RenderStatus.invalidRenderer,
        'Renderer allocation failed',
      )
    }
    this.#renderer = { pointer, width, height }
    return this.#renderer
  }
}
