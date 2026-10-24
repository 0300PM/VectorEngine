import { parseColor } from '@/engine/color'
import { engineLimits } from '@/engine/limits'
import type { VectorScene } from '@/types/scene'
import type {
  BmpBitDepth,
  ExportBackground,
  ExportFormat,
  SizeEstimate,
} from './types'

export const formatByteSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export const resolveAlphaInfo = (
  scene: VectorScene | null,
  format: ExportFormat,
  background: ExportBackground,
  bmpBitDepth: BmpBitDepth = 24,
): { requestedAlpha: boolean; outputHasAlpha: boolean; warnings: string[] } => {
  const warnings: string[] = []
  let requestedAlpha = false

  if (background === 'transparent') {
    requestedAlpha = true
  } else if (background === 'document') {
    const docBg = scene?.document.background
    if (!docBg || docBg === 'none') {
      requestedAlpha = true
    } else {
      const parsed = parseColor(docBg)
      requestedAlpha = Boolean(parsed && parsed.a < 255)
    }
  } else {
    const parsed = parseColor(background.color)
    requestedAlpha = Boolean(parsed && parsed.a < 255)
  }

  if (format === 'jpeg') {
    if (requestedAlpha) {
      warnings.push('JPEG does not support alpha transparency; output background is flattened to opaque color.')
    }
    return { requestedAlpha, outputHasAlpha: false, warnings }
  }

  if (format === 'bmp' && bmpBitDepth === 24) {
    if (requestedAlpha) {
      warnings.push('24-bit BMP stores BGR channels without alpha; switch BMP bit depth to 32-bit BGRA to preserve transparency.')
    }
    return { requestedAlpha, outputHasAlpha: false, warnings }
  }

  return { requestedAlpha, outputHasAlpha: requestedAlpha, warnings }
}

const countComplexity = (scene: VectorScene | null): number => {
  if (!scene) {
    return 12
  }
  let count = 0
  const walk = (items: VectorScene['objects']): void => {
    for (const item of items) {
      count += item.type === 'path' ? 4 : item.type === 'text' ? 3 : 1
      if (item.type === 'group') {
        walk(item.children)
      }
    }
  }
  for (const layer of scene.layers ?? []) {
    walk(layer.objects)
  }
  walk(scene.objects)
  return Math.max(1, count)
}

export const estimateExportMetrics = (params: {
  scene: VectorScene | null
  svgPreview?: string | null
  format: ExportFormat
  width: number
  height: number
  background: ExportBackground
  quality?: number
  bmpBitDepth?: BmpBitDepth
}): SizeEstimate => {
  const width = Math.max(1, Math.round(params.width))
  const height = Math.max(1, Math.round(params.height))
  const pixelCount = width * height
  const megapixels = pixelCount / 1_000_000
  const rawBufferBytes = pixelCount * 4
  const workingMemoryBytes = params.format === 'svg' ? 0 : pixelCount * 8
  const bmpBitDepth = params.bmpBitDepth ?? 24

  const alphaInfo = resolveAlphaInfo(params.scene, params.format, params.background, bmpBitDepth)
  const warnings = [...alphaInfo.warnings]

  if (workingMemoryBytes > engineLimits.softMemoryWarningBytes) {
    warnings.push(`High raster memory usage (~${formatByteSize(workingMemoryBytes)}) for ${width.toLocaleString()} × ${height.toLocaleString()} px.`)
  }

  let estimatedBytes = 0
  let exactSizeKnown = false

  if (params.format === 'svg') {
    if (params.svgPreview) {
      estimatedBytes = new TextEncoder().encode(params.svgPreview).byteLength
      exactSizeKnown = true
    } else {
      estimatedBytes = 560 + countComplexity(params.scene) * 145
    }
  } else if (params.format === 'bmp') {
    exactSizeKnown = true
    if (bmpBitDepth === 32) {
      estimatedBytes = 122 + pixelCount * 4
    } else {
      const rowStride = Math.ceil((width * 3) / 4) * 4
      estimatedBytes = 54 + rowStride * height
    }
  } else if (params.format === 'png') {
    const complexity = Math.min(1, 0.035 + Math.log2(countComplexity(params.scene) + 1) * 0.028)
    const channelFactor = alphaInfo.outputHasAlpha ? 1.18 : 1.0
    estimatedBytes = Math.round(128 + pixelCount * complexity * channelFactor + height * 6)
  } else {
    const quality = Math.min(100, Math.max(1, params.quality ?? 90))
    const qFactor = quality < 50 ? 50 / quality : (200 - quality * 2) / 100
    const bitsPerPixel = Math.max(0.18, 1.35 / Math.max(0.22, qFactor + 0.35))
    const complexityBoost = 0.55 + Math.min(0.9, Math.log2(countComplexity(params.scene) + 1) * 0.12)
    estimatedBytes = Math.round(620 + (pixelCount * bitsPerPixel * complexityBoost) / 8)
  }

  return {
    estimatedBytes,
    exactSizeKnown,
    pixelCount,
    megapixels,
    rawBufferBytes,
    workingMemoryBytes,
    hasAlpha: alphaInfo.outputHasAlpha,
    warnings,
  }
}

export const computeThumbnailDimensions = (
  width: number,
  height: number,
  maxDimension: number = engineLimits.thumbnailMaxDimension,
): { width: number; height: number; downscaled: boolean } => {
  const safeW = Math.max(1, Math.round(width))
  const safeH = Math.max(1, Math.round(height))
  const largest = Math.max(safeW, safeH)
  if (largest <= maxDimension) {
    return { width: safeW, height: safeH, downscaled: false }
  }
  const ratio = maxDimension / largest
  return {
    width: Math.max(1, Math.round(safeW * ratio)),
    height: Math.max(1, Math.round(safeH * ratio)),
    downscaled: true,
  }
}
