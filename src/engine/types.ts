import type { RenderScene } from '@/core/scene'

export const engineKinds = ['wasm', 'canvas2d'] as const
export type EngineKind = (typeof engineKinds)[number]

export type RenderResult = {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8ClampedArray
  readonly engine: EngineKind
}

export interface VectorEngine {
  readonly kind: EngineKind
  render(scene: RenderScene): Promise<RenderResult>
  dispose(): void
}

export class EngineUnavailableError extends Error {
  readonly kind: EngineKind

  constructor(kind: EngineKind, cause?: unknown) {
    super(`Engine "${kind}" is unavailable`, { cause })
    this.name = 'EngineUnavailableError'
    this.kind = kind
  }
}

export class RenderFailedError extends Error {
  readonly kind: EngineKind
  readonly code: number

  constructor(kind: EngineKind, code: number, detail: string) {
    super(`Engine "${kind}" failed to render: ${detail}`)
    this.name = 'RenderFailedError'
    this.kind = kind
    this.code = code
  }
}
