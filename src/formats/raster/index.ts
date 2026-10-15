import type { VectorDocument } from '@/core/document'
import type { SceneBuildResult, UnsupportedFeature } from '@/core/scene'
import type { RenderResult, SurfaceFactory } from '@/engine'
import { analyzeCompatibility } from '../compatibility/analyze'
import { buildConversionReport, type ConversionOutcome } from '../compatibility/convert'
import {
  defineCapabilities,
  type CapabilityTarget,
  type FormatCapabilities,
} from '../compatibility/features'
import type { Transformation } from '../compatibility/report'

export const rasterFormats = ['png', 'jpeg', 'webp'] as const
export type RasterFormat = (typeof rasterFormats)[number]

export type RasterEncodeOptions = {
  readonly format: RasterFormat
  readonly quality: number
}

type RasterFormatInfo = {
  readonly mimeType: string
  readonly extension: string
  readonly supportsAlpha: boolean
  readonly supportsQuality: boolean
}

export const rasterFormatInfo: Readonly<Record<RasterFormat, RasterFormatInfo>> = {
  png: { mimeType: 'image/png', extension: 'png', supportsAlpha: true, supportsQuality: false },
  jpeg: { mimeType: 'image/jpeg', extension: 'jpg', supportsAlpha: false, supportsQuality: true },
  webp: { mimeType: 'image/webp', extension: 'webp', supportsAlpha: true, supportsQuality: true },
}

export const MIN_QUALITY = 0.1
export const MAX_QUALITY = 1

const rasterBaseCapabilities: Partial<FormatCapabilities> = {
  text: 'unsupported',
  image: 'unsupported',
  evenodd: 'converted',
  groupOpacity: 'converted',
  layers: 'dropped',
  hiddenLayers: 'dropped',
  lockedLayers: 'dropped',
  physicalUnits: 'converted',
  displayP3: 'converted',
  assets: 'dropped',
  metadata: 'dropped',
}

export const rasterCapabilities: Readonly<Record<RasterFormat, FormatCapabilities>> = {
  png: defineCapabilities('native', rasterBaseCapabilities),
  jpeg: defineCapabilities('native', {
    ...rasterBaseCapabilities,
    colorAlpha: 'dropped',
    transparentBackground: 'dropped',
  }),
  webp: defineCapabilities('native', rasterBaseCapabilities),
}

export const rasterTarget = (format: RasterFormat): CapabilityTarget => ({
  id: format,
  label: format.toUpperCase(),
  capabilities: rasterCapabilities[format],
  medium: 'raster',
})

export const analyzeRasterExport = (document: VectorDocument, format: RasterFormat) =>
  analyzeCompatibility(document, rasterTarget(format))

export const flattenOntoWhite = (pixels: Uint8ClampedArray): Uint8ClampedArray => {
  const flattened = new Uint8ClampedArray(pixels.length)
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = (pixels[index + 3] ?? 0) / 255
    const inverse = 255 * (1 - alpha)
    flattened[index] = (pixels[index] ?? 0) * alpha + inverse
    flattened[index + 1] = (pixels[index + 1] ?? 0) * alpha + inverse
    flattened[index + 2] = (pixels[index + 2] ?? 0) * alpha + inverse
    flattened[index + 3] = 255
  }
  return flattened
}

type BlobCapableSurface =
  | { convertToBlob(options: { type: string; quality?: number }): Promise<Blob> }
  | { toBlob(callback: (blob: Blob | null) => void, type: string, quality?: number): void }

const surfaceToBlob = (
  surface: BlobCapableSurface,
  type: string,
  quality?: number,
): Promise<Blob> => {
  if ('convertToBlob' in surface) {
    return surface.convertToBlob({ type, quality })
  }
  return new Promise((resolve, reject) => {
    surface.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Encoding to ${type} failed`))),
      type,
      quality,
    )
  })
}

export const encodeRenderResult = async (
  result: RenderResult,
  options: RasterEncodeOptions,
  createSurface: SurfaceFactory,
): Promise<Blob> => {
  const info = rasterFormatInfo[options.format]
  const surface = createSurface(result.width, result.height)
  const context = surface.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context is not available')
  }
  const image = context.createImageData(result.width, result.height)
  image.data.set(info.supportsAlpha ? result.pixels : flattenOntoWhite(result.pixels))
  context.putImageData(image, 0, 0)

  const quality = Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, options.quality))
  return surfaceToBlob(
    surface as unknown as BlobCapableSurface,
    info.mimeType,
    info.supportsQuality ? quality : undefined,
  )
}

const describeUnsupported = (unsupported: readonly UnsupportedFeature[], kind: string): string =>
  unsupported
    .filter((item) => item.feature === kind)
    .map((item) => item.nodeId)
    .join(', ')

const rasterTransformations = (
  document: VectorDocument,
  build: SceneBuildResult,
  result: RenderResult,
  format: RasterFormat,
): Transformation[] => {
  const transformations: Transformation[] = [
    { kind: 'rasterized', detail: `${result.width}×${result.height} px, ${result.engine}` },
  ]
  if (document.unit !== 'px') {
    transformations.push({
      kind: 'units_converted',
      detail: `${document.unit} → px @ ${document.exportSettings.dpi} dpi`,
    })
  }
  if (!rasterFormatInfo[format].supportsAlpha) {
    transformations.push({ kind: 'alpha_flattened', detail: 'white' })
  }
  const hidden = document.layers.filter((layer) => !layer.visible)
  if (hidden.length > 0) {
    transformations.push({
      kind: 'hidden_layers_omitted',
      detail: hidden.map((layer) => layer.name).join(', '),
    })
  }
  if (document.layers.length > 0) {
    transformations.push({ kind: 'layers_flattened' })
  }
  const evenodd = describeUnsupported(build.unsupported, 'evenodd')
  if (evenodd) {
    transformations.push({ kind: 'fill_rule_converted', detail: evenodd })
  }
  const skipped = build.unsupported.filter((item) => item.feature !== 'evenodd')
  if (skipped.length > 0) {
    transformations.push({
      kind: 'objects_skipped',
      detail: skipped.map((item) => item.nodeId).join(', '),
    })
  }
  return transformations
}

export type RasterExportInput = {
  readonly document: VectorDocument
  readonly build: SceneBuildResult
  readonly result: RenderResult
  readonly options: RasterEncodeOptions
  readonly fileName: string
  readonly sourceFormat: string
}

export const exportRaster = async (
  input: RasterExportInput,
  createSurface: SurfaceFactory,
): Promise<ConversionOutcome> => {
  const { document, build, result, options } = input
  const blob = await encodeRenderResult(result, options, createSurface)
  const compatibility = analyzeCompatibility(document, rasterTarget(options.format))
  const skipped = build.unsupported.filter((item) => item.feature !== 'evenodd').length
  const report = buildConversionReport(
    { sourceFormat: input.sourceFormat, fileName: input.fileName },
    compatibility,
    {
      processedObjects: build.scene.items.length,
      skippedObjects: skipped,
      transformations: rasterTransformations(document, build, result, options.format),
      validation: blob.size > 0 ? 'passed' : 'failed',
    },
  )
  return { blob, report }
}
