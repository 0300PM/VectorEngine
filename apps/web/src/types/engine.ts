import type { VectorScene } from './scene'

export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'bmp'
export type RenderState = 'idle' | 'initializing' | 'validating' | 'rendering' | 'ready' | 'error' | 'exporting'
export type IssueSeverity = 'error' | 'warning'
export type BackgroundMode = 'document' | 'transparent' | 'custom'

export interface ValidationIssue {
  code: string
  message: string
  path: string
  severity: IssueSeverity
  offset?: number
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  scene?: VectorScene
}

export interface RenderOptions {
  width?: number
  height?: number
  background?: string | null
}

export interface ExportOptions {
  format: ExportFormat
  width: number
  height: number
  quality: number
  background: string | null
}

export interface RenderResult {
  svg: string
  width: number
  height: number
}

export interface ExportResult {
  data: Uint8Array
  mimeType: string
  extension: string
}

export interface EngineBackend {
  readonly name: string
  validate(source: string): Promise<ValidationResult>
  renderSvg(source: string, options?: RenderOptions): Promise<RenderResult>
  export(source: string, options: ExportOptions): Promise<ExportResult>
  destroy?(): void
}

export interface ExportSettings {
  format: ExportFormat
  width: number
  height: number
  scale: number
  lockAspect: boolean
  backgroundMode: BackgroundMode
  background: string
  quality: number
}
