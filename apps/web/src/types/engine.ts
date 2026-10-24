import type { VectorScene } from './scene'
import type {
  BackgroundMode,
  BmpBitDepth,
  BoundsMode,
  ExportBackground,
  ExportFormat,
  ExportRegion,
  ExportScalePreset,
  ExportTarget,
  FitMode,
  ScaleMode,
} from '@/export/types'

export type {
  BackgroundMode,
  BmpBitDepth,
  BoundsMode,
  ExportBackground,
  ExportFormat,
  ExportRegion,
  ExportScalePreset,
  ExportTarget,
  FitMode,
  ScaleMode,
}

export type RenderState = 'idle' | 'initializing' | 'validating' | 'rendering' | 'ready' | 'error' | 'exporting'
export type IssueSeverity = 'error' | 'warning'

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
  scale?: number
  background?: ExportBackground | string | null
  target?: ExportTarget
  includeHidden?: boolean
  trimToBounds?: boolean
  clipToBounds?: boolean
  margin?: number
  fitMode?: FitMode
  preserveAspectRatio?: boolean
  minifySvg?: boolean
}

export interface BackendExportOptions {
  format: ExportFormat
  width?: number
  height?: number
  scale?: number
  quality: number
  qualityExplicit?: boolean
  background: ExportBackground | string | null
  target?: ExportTarget
  includeHidden?: boolean
  trimToBounds?: boolean
  clipToBounds?: boolean
  margin?: number
  fitMode?: FitMode
  preserveAspectRatio?: boolean
  minifySvg?: boolean
  minifyExplicit?: boolean
  bmpBitDepth?: BmpBitDepth
  maxMemoryBytes?: number
  signal?: AbortSignal
}

export interface RenderResult {
  svg: string
  width: number
  height: number
  hasAlpha?: boolean
  bounds?: ExportRegion
  issues: ValidationIssue[]
}

export interface BackendExportResult {
  data: Uint8Array
  mimeType: string
  extension: string
  width: number
  height: number
  hasAlpha: boolean
  bounds?: ExportRegion
  issues: ValidationIssue[]
}

export interface EngineBackend {
  readonly name: string
  readonly isWorker?: boolean
  validate(source: string): Promise<ValidationResult>
  renderSvg(source: string, options?: RenderOptions): Promise<RenderResult>
  export(source: string, options: BackendExportOptions): Promise<BackendExportResult>
  measureBounds?(source: string, target: ExportTarget, includeHidden?: boolean): Promise<ExportRegion | null>
  destroy?(): void
  dispose?(): void
}

export interface ExportSettings {
  mode: 'single' | 'batch'
  targetType: ExportTarget['type']
  selectedObjectIds: string[]
  targetGroupId: string
  targetLayerId: string
  targetObjectId: string
  targetWorkspaceId: string
  customRegion: ExportRegion
  useCustomRegion: boolean
  includeHidden: boolean
  boundsMode: BoundsMode
  format: ExportFormat
  width: number
  height: number
  scale: ExportScalePreset
  scaleMode: ScaleMode
  lockAspect: boolean
  fitMode: FitMode
  backgroundMode: BackgroundMode
  background: string
  quality: number
  margin: number
  clipToBounds: boolean
  minifySvg: boolean
  bmpBitDepth: BmpBitDepth
  filenameTemplate: string
  batchPackageZip: boolean
}
