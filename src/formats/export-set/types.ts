import type { Color } from '@/core/document'
import { rasterFormats, type RasterFormat } from '../raster'

export const vectorExportFormats = ['svg', 'pdf'] as const
export type VectorExportFormat = (typeof vectorExportFormats)[number]

export const exportFormats = ['svg', 'pdf', 'png', 'jpeg', 'webp', 'tiff', 'ico'] as const
export type ExportFormat = (typeof exportFormats)[number]

export const isRasterExportFormat = (format: ExportFormat): format is RasterFormat =>
  (rasterFormats as readonly string[]).includes(format)

export const isVectorExportFormat = (format: ExportFormat): format is VectorExportFormat =>
  (vectorExportFormats as readonly string[]).includes(format)

export const variantSizeModes = ['original', 'scale', 'fixed', 'sizes'] as const
export type VariantSizeMode = (typeof variantSizeModes)[number]

export type VariantSize =
  | { readonly mode: 'original' }
  | { readonly mode: 'scale'; readonly factor: number }
  | { readonly mode: 'fixed'; readonly width: number; readonly height: number }
  | { readonly mode: 'sizes'; readonly sizes: readonly number[] }

export const backgroundModes = ['document', 'transparent', 'color'] as const
export type BackgroundMode = (typeof backgroundModes)[number]

export type VariantBackground =
  | { readonly mode: 'document' }
  | { readonly mode: 'transparent' }
  | { readonly mode: 'color'; readonly color: Color }

export type ExportVariant = {
  readonly id: string
  readonly format: ExportFormat
  readonly size: VariantSize
  readonly background: VariantBackground
  readonly quality: number
  readonly suffix: string
  readonly padding: number
  readonly fileName?: string
  readonly dpi?: number
  readonly recolor?: Color
}

export type ExportScope =
  | { readonly kind: 'document' }
  | { readonly kind: 'nodes'; readonly nodeIds: readonly string[]; readonly padding: number }

export type ExportPreset = {
  readonly id: string
  readonly name: string
  readonly variants: readonly ExportVariant[]
  readonly builtIn?: boolean
}

export type ExportSet = {
  readonly name: string
  readonly variants: readonly ExportVariant[]
  readonly scope: ExportScope
}

export const DEFAULT_VARIANT_QUALITY = 0.92
export const MAX_VARIANT_PADDING = 0.45
export const MAX_RASTER_SIDE = 16384
export const MAX_RASTER_PIXELS = 50_000_000
export const MAX_SCALE_FACTOR = 64

export const exportFormatExtension = (format: ExportFormat): string =>
  format === 'jpeg' ? 'jpg' : format

export const documentScope: ExportScope = { kind: 'document' }
