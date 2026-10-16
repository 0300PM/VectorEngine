import { pixelsPerUnit, type VectorDocument } from '@/core/document'
import type { PixelSize } from '@/core/scene'
import { analyzeCompatibility } from '../compatibility/analyze'
import type { CapabilityTarget } from '../compatibility/features'
import type { CompatibilityReport } from '../compatibility/report'
import { icoTarget, isValidIcoSize, rasterTarget } from '../raster'
import type { FormatRegistry } from '../registry'
import { applyVariantStyle, scopeDocument } from './scope'
import {
  MAX_RASTER_PIXELS,
  MAX_RASTER_SIDE,
  MAX_SCALE_FACTOR,
  exportFormatExtension,
  isRasterExportFormat,
  type ExportFormat,
  type ExportSet,
  type ExportVariant,
} from './types'

export const planProblems = [
  'unsupported_format',
  'invalid_size',
  'size_too_large',
  'ico_size_out_of_range',
  'duplicate_file_name',
  'empty_scope',
  'blocked',
] as const
export type PlanProblem = (typeof planProblems)[number]

export type PlannedOutput = {
  readonly variantId: string
  readonly format: ExportFormat
  readonly fileName: string
  readonly pixelSize?: PixelSize
  readonly sizes?: readonly number[]
  readonly compatibility?: CompatibilityReport
  readonly problems: readonly PlanProblem[]
}

export type ExportPlan = {
  readonly baseName: string
  readonly outputs: readonly PlannedOutput[]
  readonly ok: boolean
}

export type PlanContext = {
  readonly baseName: string
  readonly registry: FormatRegistry
}

type ResolvedSize = {
  readonly pixelSize?: PixelSize
  readonly sizes?: readonly number[]
  readonly problems: readonly PlanProblem[]
}

const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0

export const sanitizeFileName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, '-').trim()

export const variantFileName = (variant: ExportVariant, baseName: string): string =>
  sanitizeFileName(
    variant.fileName ?? `${baseName}${variant.suffix}.${exportFormatExtension(variant.format)}`,
  )

export const variantTarget = (
  format: ExportFormat,
  registry: FormatRegistry,
): CapabilityTarget | undefined => {
  if (isRasterExportFormat(format)) {
    return rasterTarget(format)
  }
  return format === 'ico' ? icoTarget : registry.findWriter(format)
}

export const variantDpi = (variant: ExportVariant, document: VectorDocument): number =>
  variant.dpi ?? document.exportSettings.dpi

export const documentPixelSize = (document: VectorDocument, dpi: number): PixelSize => {
  const scale = pixelsPerUnit(document.unit, dpi)
  return {
    width: Math.max(1, Math.round(document.width * scale)),
    height: Math.max(1, Math.round(document.height * scale)),
  }
}

const icoSizes = (sizes: readonly number[]): ResolvedSize => {
  if (sizes.length === 0 || new Set(sizes).size !== sizes.length) {
    return { problems: ['invalid_size'] }
  }
  return sizes.every(isValidIcoSize)
    ? { sizes, problems: [] }
    : { problems: ['ico_size_out_of_range'] }
}

export const resolveVariantSize = (
  variant: ExportVariant,
  document: VectorDocument,
): ResolvedSize => {
  const { size } = variant
  if (variant.format === 'ico') {
    return size.mode === 'sizes' ? icoSizes(size.sizes) : { problems: ['invalid_size'] }
  }
  const base = documentPixelSize(document, variantDpi(variant, document))
  let pixelSize: PixelSize | undefined
  switch (size.mode) {
    case 'original':
      pixelSize = base
      break
    case 'scale':
      pixelSize =
        size.factor > 0 && size.factor <= MAX_SCALE_FACTOR
          ? {
              width: Math.max(1, Math.round(base.width * size.factor)),
              height: Math.max(1, Math.round(base.height * size.factor)),
            }
          : undefined
      break
    case 'fixed':
      pixelSize =
        isPositiveInteger(size.width) && isPositiveInteger(size.height)
          ? { width: size.width, height: size.height }
          : undefined
      break
    case 'sizes':
      pixelSize = undefined
      break
  }
  if (!pixelSize) {
    return { problems: ['invalid_size'] }
  }
  const tooLarge =
    isRasterExportFormat(variant.format) &&
    (pixelSize.width > MAX_RASTER_SIDE ||
      pixelSize.height > MAX_RASTER_SIDE ||
      pixelSize.width * pixelSize.height > MAX_RASTER_PIXELS)
  return { pixelSize, problems: tooLarge ? ['size_too_large'] : [] }
}

export const planExportSet = (
  document: VectorDocument,
  set: ExportSet,
  context: PlanContext,
): ExportPlan => {
  const scoped = scopeDocument(document, set.scope)
  const seen = new Set<string>()
  const outputs = set.variants.map((variant): PlannedOutput => {
    const problems: PlanProblem[] = scoped.empty ? ['empty_scope'] : []
    const styled = applyVariantStyle(scoped.document, variant)
    const target = variantTarget(variant.format, context.registry)
    const compatibility = target ? analyzeCompatibility(styled, target) : undefined
    if (!target) {
      problems.push('unsupported_format')
    } else if (compatibility?.verdict === 'blocked') {
      problems.push('blocked')
    }
    const resolved = resolveVariantSize(variant, styled)
    problems.push(...resolved.problems)
    const fileName = variantFileName(variant, context.baseName)
    const key = fileName.toLowerCase()
    if (seen.has(key)) {
      problems.push('duplicate_file_name')
    }
    seen.add(key)
    return {
      variantId: variant.id,
      format: variant.format,
      fileName,
      ...(resolved.pixelSize ? { pixelSize: resolved.pixelSize } : {}),
      ...(resolved.sizes ? { sizes: resolved.sizes } : {}),
      ...(compatibility ? { compatibility } : {}),
      problems,
    }
  })
  return {
    baseName: context.baseName,
    outputs,
    ok: outputs.length > 0 && outputs.every((output) => output.problems.length === 0),
  }
}
