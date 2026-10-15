import type { RenderScene } from '@/core/scene'
import type { RenderResult, SurfaceFactory } from '@/engine'
import type { FormatWarning } from '../types'

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

export const inspectRasterExport = (scene: RenderScene, format: RasterFormat): FormatWarning[] =>
  !rasterFormatInfo[format].supportsAlpha && scene.background.a < 1
    ? [{ code: 'alpha_flattened', detail: format }]
    : []

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
