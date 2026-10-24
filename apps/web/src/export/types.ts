export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'bmp'
export type ExportScalePreset = 0.5 | 1 | 2 | 3 | 4
export type ScaleMode = 'preset' | 'custom'
export type FitMode = 'contain' | 'cover' | 'stretch'
export type BoundsMode = 'document' | 'content'
export type BmpBitDepth = 24 | 32
export type BackgroundMode = 'document' | 'transparent' | 'custom'
export type EditorBackdrop = 'checker' | 'light' | 'dark' | 'white'
export type ExportTargetKind = ExportTarget['type']

export interface ExportRegion {
  x: number
  y: number
  width: number
  height: number
}

export type ExportTarget =
  | { type: 'scene' }
  | { type: 'selection'; objectIds: string[] }
  | { type: 'group'; objectId: string }
  | { type: 'layer'; layerId: string }
  | { type: 'object'; objectId: string }
  | { type: 'objects'; objectIds: string[] }
  | { type: 'workspace'; workspaceId?: string; region?: ExportRegion }

export type ExportBackground = 'document' | 'transparent' | { color: string }

export interface ExportOptions {
  format: ExportFormat
  target: ExportTarget
  scale?: ExportScalePreset
  width?: number
  height?: number
  preserveAspectRatio?: boolean
  fitMode?: FitMode
  background: ExportBackground
  quality?: number
  trimToBounds?: boolean
  clipToBounds?: boolean
  includeHidden?: boolean
  margin?: number
  minifySvg?: boolean
  bmpBitDepth?: BmpBitDepth
  maxMemoryBytes?: number
  documentName?: string
  filenameTemplate?: string
  signal?: AbortSignal
}

export interface ExportResult {
  blob: Blob
  data: Uint8Array
  bytes: Uint8Array
  filename: string
  mimeType: string
  extension: string
  width: number
  height: number
  sizeBytes: number
  estimatedBytes: number
  pixelCount: number
  memoryBytes: number
  hasAlpha: boolean
  warnings: string[]
  durationMs: number
  bounds: ExportRegion
}

export interface ExportErrorInfo {
  code: string
  message: string
  path?: string
}

export type ExportOutcome =
  | { ok: true; result: ExportResult }
  | { ok: false; error: ExportErrorInfo; warnings: string[] }

export interface SizeEstimate {
  estimatedBytes: number
  exactSizeKnown: boolean
  pixelCount: number
  megapixels: number
  rawBufferBytes: number
  workingMemoryBytes: number
  hasAlpha: boolean
  warnings: string[]
}

export interface ExportPreviewSnapshot {
  svg: string
  previewWidth: number
  previewHeight: number
  outputWidth: number
  outputHeight: number
  viewBox: ExportRegion
  downscaled: boolean
  estimate: SizeEstimate
}

export type ExportPreviewState = ExportPreviewSnapshot

export interface BatchExportItemInput {
  id: string
  label: string
  target: ExportTarget
  options?: Partial<Omit<ExportOptions, 'target' | 'signal'>>
}

export type BatchItemStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'

export interface BatchExportItemState {
  id: string
  label: string
  target: ExportTarget
  status: BatchItemStatus
  filename: string
  sizeBytes?: number
  durationMs?: number
  warnings: string[]
  error?: ExportErrorInfo
  result?: ExportResult
}

export interface BatchCollisionRecord {
  itemId: string
  originalFilename: string
  resolvedFilename: string
}

export interface BatchProgressEvent {
  completed: number
  total: number
  currentItem?: BatchExportItemState
  items: BatchExportItemState[]
}

export interface BatchExportReport {
  items: BatchExportItemState[]
  succeeded: number
  failed: number
  cancelledCount: number
  totalBytes: number
  totalDurationMs: number
  collisions: BatchCollisionRecord[]
  cancelled: boolean
  zipBlob?: Blob
  zipData?: Uint8Array
  zipFilename?: string
}

export interface SceneCatalogEntry {
  id: string
  label: string
  type: string
  depth: number
  visible: boolean
  layerId?: string
}
