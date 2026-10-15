import { Canvas2DEngine } from './canvas2d/Canvas2DEngine'
import type { SurfaceFactory } from './canvas2d/surface'
import { WasmEngine } from './wasm/WasmEngine'
import { type EngineKind, type VectorEngine } from './types'

export type EngineResolution = {
  readonly engine: VectorEngine
  readonly requested: EngineKind
  readonly fallbackReason?: string
}

export type EngineProviderOptions = {
  readonly wasmGlueUrl: string
  readonly surfaceFactory?: SurfaceFactory
}

const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : ''
    return `${error.message}${cause}`
  }
  return String(error)
}

export class EngineProvider {
  readonly #options: EngineProviderOptions
  readonly #instances = new Map<EngineKind, Promise<VectorEngine>>()

  constructor(options: EngineProviderOptions) {
    this.#options = options
  }

  get(kind: EngineKind): Promise<VectorEngine> {
    const existing = this.#instances.get(kind)
    if (existing) {
      return existing
    }
    const created = this.#create(kind)
    created.catch(() => this.#instances.delete(kind))
    this.#instances.set(kind, created)
    return created
  }

  async resolve(requested: EngineKind): Promise<EngineResolution> {
    try {
      return { engine: await this.get(requested), requested }
    } catch (error) {
      if (requested === 'canvas2d') {
        throw error
      }
      return {
        engine: await this.get('canvas2d'),
        requested,
        fallbackReason: describeError(error),
      }
    }
  }

  async disposeAll(): Promise<void> {
    const engines = await Promise.allSettled(this.#instances.values())
    this.#instances.clear()
    engines.forEach((result) => {
      if (result.status === 'fulfilled') {
        result.value.dispose()
      }
    })
  }

  #create(kind: EngineKind): Promise<VectorEngine> {
    switch (kind) {
      case 'wasm':
        return WasmEngine.load(this.#options.wasmGlueUrl)
      case 'canvas2d':
        return Promise.resolve(new Canvas2DEngine(this.#options.surfaceFactory))
    }
  }
}
