import { frameDocument, pixelsPerUnit, type VectorDocument } from '@/core/document'
import {
  buildRenderScene,
  fitRenderScene,
  type PixelSize,
  type RenderScene,
  type SceneBuildResult,
} from '@/core/scene'
import type { RenderResult, SurfaceFactory } from '@/engine'
import { analyzeCompatibility } from '../compatibility/analyze'
import {
  buildConversionReport,
  convertDocument,
  type ConversionOutcome,
} from '../compatibility/convert'
import type { ConversionReport } from '../compatibility/report'
import {
  ICO_MIME_TYPE,
  encodeIco,
  exportRaster,
  icoTarget,
  readIcoDirectory,
  type IcoImage,
} from '../raster'
import type { FormatRegistry } from '../registry'
import { bytesToBlob } from '../types'
import { planExportSet, variantDpi, type ExportPlan, type PlannedOutput } from './plan'
import { applyVariantStyle, scopeDocument } from './scope'
import {
  isRasterExportFormat,
  isVectorExportFormat,
  type ExportSet,
  type ExportVariant,
} from './types'

export type ExportRenderer = (scene: RenderScene) => Promise<RenderResult>

export type ExportSetContext = {
  readonly registry: FormatRegistry
  readonly render: ExportRenderer
  readonly createSurface: SurfaceFactory
  readonly sourceFormat: string
  readonly signal?: AbortSignal
}

export type ExportedFile = {
  readonly variantId: string
  readonly fileName: string
  readonly blob: Blob
  readonly report: ConversionReport
}

export type ExportFailure = {
  readonly variantId: string
  readonly fileName: string
  readonly message: string
}

export type ExportSetResult = {
  readonly plan: ExportPlan
  readonly files: readonly ExportedFile[]
  readonly failures: readonly ExportFailure[]
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled')
    this.name = 'ExportCancelledError'
  }
}

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw new ExportCancelledError()
  }
}

const insetFor = (variant: ExportVariant, size: PixelSize): number =>
  Math.max(0, variant.padding) * Math.min(size.width, size.height)

const frameForVector = (
  document: VectorDocument,
  variant: ExportVariant,
  pixelSize: PixelSize,
): VectorDocument => {
  const scale = pixelsPerUnit(document.unit, variantDpi(variant, document))
  const frame = { width: pixelSize.width / scale, height: pixelSize.height / scale }
  return frameDocument(document, frame, variant.padding * Math.min(frame.width, frame.height))
}

const renderFitted = async (
  build: SceneBuildResult,
  variant: ExportVariant,
  size: PixelSize,
  context: ExportSetContext,
): Promise<RenderResult> => {
  throwIfAborted(context.signal)
  return context.render(fitRenderScene(build.scene, size, insetFor(variant, size)))
}

const exportIco = async (
  document: VectorDocument,
  variant: ExportVariant,
  output: PlannedOutput,
  context: ExportSetContext,
): Promise<ConversionOutcome> => {
  const dpi = variantDpi(variant, document)
  const build = buildRenderScene(document, { dpi })
  const images: IcoImage[] = []
  for (const size of output.sizes ?? []) {
    images.push(await renderFitted(build, variant, { width: size, height: size }, context))
  }
  const bytes = encodeIco(images, { dpi })
  const skipped = build.unsupported.filter((item) => item.feature !== 'evenodd')
  const report = buildConversionReport(
    { sourceFormat: context.sourceFormat, fileName: output.fileName },
    analyzeCompatibility(document, icoTarget),
    {
      processedObjects: build.scene.items.length,
      skippedObjects: skipped.length,
      transformations: [
        { kind: 'rasterized', detail: `${images.map((image) => image.width).join(', ')} px` },
        { kind: 'layers_flattened' },
        ...(skipped.length > 0
          ? [
              {
                kind: 'objects_skipped' as const,
                detail: skipped.map((item) => item.nodeId).join(', '),
              },
            ]
          : []),
      ],
      validation: readIcoDirectory(bytes)?.length === images.length ? 'passed' : 'failed',
    },
  )
  return { blob: bytesToBlob(bytes, ICO_MIME_TYPE), report }
}

export const exportVariant = async (
  scoped: VectorDocument,
  variant: ExportVariant,
  output: PlannedOutput,
  context: ExportSetContext,
): Promise<ConversionOutcome> => {
  const document = applyVariantStyle(scoped, variant)
  const conversion = { sourceFormat: context.sourceFormat, fileName: output.fileName }
  if (variant.format === 'ico') {
    return exportIco(document, variant, output, context)
  }
  if (!output.pixelSize) {
    throw new Error(`Variant ${variant.id} has no resolved size`)
  }
  if (isVectorExportFormat(variant.format)) {
    const writer = context.registry.findWriter(variant.format)
    if (!writer) {
      throw new Error(`No writer registered for ${variant.format}`)
    }
    throwIfAborted(context.signal)
    return convertDocument(writer, frameForVector(document, variant, output.pixelSize), conversion)
  }
  if (!isRasterExportFormat(variant.format)) {
    throw new Error(`Unsupported export format ${variant.format}`)
  }
  const dpi = variantDpi(variant, document)
  const build = buildRenderScene(document, { dpi })
  const result = await renderFitted(build, variant, output.pixelSize, context)
  return exportRaster(
    {
      document,
      build,
      result,
      options: { format: variant.format, quality: variant.quality, dpi },
      ...conversion,
    },
    context.createSurface,
  )
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const runExportSet = async (
  document: VectorDocument,
  set: ExportSet,
  baseName: string,
  context: ExportSetContext,
): Promise<ExportSetResult> => {
  const plan = planExportSet(document, set, { baseName, registry: context.registry })
  const scoped = scopeDocument(document, set.scope).document
  const files: ExportedFile[] = []
  const failures: ExportFailure[] = []
  for (const output of plan.outputs) {
    const variant = set.variants.find((candidate) => candidate.id === output.variantId)
    if (!variant || output.problems.length > 0) {
      failures.push({
        variantId: output.variantId,
        fileName: output.fileName,
        message: output.problems.join(', ') || 'missing_variant',
      })
      continue
    }
    try {
      const outcome = await exportVariant(scoped, variant, output, context)
      files.push({
        variantId: variant.id,
        fileName: output.fileName,
        blob: outcome.blob,
        report: outcome.report,
      })
    } catch (error) {
      failures.push({
        variantId: variant.id,
        fileName: output.fileName,
        message: describeError(error),
      })
      if (error instanceof ExportCancelledError) {
        break
      }
    }
  }
  return { plan, files, failures }
}
