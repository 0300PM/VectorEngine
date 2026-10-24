import { VectorEngineError } from '@/engine/errors'
import { engineLimits } from '@/engine/limits'
import type { EngineBackend } from '@/types/engine'
import type { VectorScene } from '@/types/scene'
import { collectSceneCatalog, extractScopedScene, resolveExportViewport } from './bounds'
import { extensionForFormat, formatExportFilename, mimeTypeForFormat } from './filename'
import { computeThumbnailDimensions, estimateExportMetrics } from './sizeEstimator'
import type {
  ExportOptions,
  ExportPreviewSnapshot,
  ExportResult,
  ExportTarget,
} from './types'
import { validateExportOptions } from './validation'

export interface ExecuteExportParams {
  backend: EngineBackend
  source: string
  options: ExportOptions
  documentTitle?: string
  filenameTemplate?: string
  index?: number
  overrideFilename?: string
}

const resolveTargetLabel = (scene: VectorScene, target: ExportTarget): { objectLabel?: string; layerLabel?: string } => {
  const catalog = collectSceneCatalog(scene)
  if (target.type === 'object' || target.type === 'group') {
    const found = catalog.objects.find((entry) => entry.id === target.objectId)
    return {
      objectLabel: found?.label ?? target.objectId,
      ...(found?.layerId ? { layerLabel: found.layerId } : {}),
    }
  }
  if (target.type === 'layer') {
    const layer = catalog.layers.find((entry) => entry.id === target.layerId)
    return {
      objectLabel: layer?.label ?? target.layerId,
      layerLabel: layer?.label ?? target.layerId,
    }
  }
  if (target.type === 'workspace') {
    const ws = catalog.workspaces.find((entry) => entry.id === target.workspaceId)
    return { objectLabel: ws?.name ?? target.workspaceId ?? 'workspace' }
  }
  if ((target.type === 'selection' || target.type === 'objects') && target.objectIds.length === 1) {
    const single = catalog.objects.find((entry) => entry.id === target.objectIds[0])
    const resolved = single?.label ?? target.objectIds[0]
    return {
      ...(resolved ? { objectLabel: resolved } : {}),
      ...(single?.layerId ? { layerLabel: single.layerId } : {}),
    }
  }
  return {}
}

export const executeExport = async ({
  backend,
  source,
  options,
  documentTitle,
  filenameTemplate,
  index,
  overrideFilename,
}: ExecuteExportParams): Promise<ExportResult> => {
  const snapshotSource = String(source)
  const startedAt = performance.now()

  if (options.signal?.aborted) {
    throw new VectorEngineError('export.cancelled', 'Export operation cancelled')
  }

  const sceneValidation = await backend.validate(snapshotSource)
  if (!sceneValidation.valid || !sceneValidation.scene) {
    throw new VectorEngineError(
      sceneValidation.issues[0]?.code ?? 'validation.failed',
      sceneValidation.issues[0]?.message ?? 'Scene validation failed',
      sceneValidation.issues,
    )
  }

  const scene = sceneValidation.scene
  const preflight = validateExportOptions(options, scene)
  if (!preflight.ok) {
    const first = preflight.errors[0]!
    throw new VectorEngineError(
      first.code,
      first.message,
      preflight.errors.map((err) => ({
        code: err.code,
        message: err.message,
        path: err.path ?? '/options',
        severity: 'error',
      })),
    )
  }

  const scoped = extractScopedScene(scene, options.target, Boolean(options.includeHidden))
  const viewport = resolveExportViewport(scene, scoped, options)

  const preEstimate = estimateExportMetrics({
    scene: scoped,
    format: options.format,
    width: viewport.outputWidth,
    height: viewport.outputHeight,
    background: options.background,
    ...(options.quality !== undefined ? { quality: options.quality } : {}),
    ...(options.bmpBitDepth !== undefined ? { bmpBitDepth: options.bmpBitDepth } : {}),
  })

  if (options.signal?.aborted) {
    throw new VectorEngineError('export.cancelled', 'Export operation cancelled')
  }

  const backendResult = await backend.export(snapshotSource, {
    format: options.format,
    scale: options.scale ?? 1,
    ...(options.width !== undefined ? { width: options.width } : {}),
    ...(options.height !== undefined ? { height: options.height } : {}),
    quality: options.quality ?? 90,
    background: options.background,
    target: options.target,
    ...(options.includeHidden !== undefined ? { includeHidden: options.includeHidden } : {}),
    ...(options.trimToBounds !== undefined ? { trimToBounds: options.trimToBounds } : {}),
    ...(options.clipToBounds !== undefined ? { clipToBounds: options.clipToBounds } : {}),
    ...(options.margin !== undefined ? { margin: options.margin } : {}),
    fitMode: options.fitMode ?? (options.preserveAspectRatio === false ? 'stretch' : 'contain'),
    ...(options.preserveAspectRatio !== undefined ? { preserveAspectRatio: options.preserveAspectRatio } : {}),
    ...(options.minifySvg !== undefined ? { minifySvg: options.minifySvg } : {}),
    bmpBitDepth: options.bmpBitDepth ?? 24,
    maxMemoryBytes: options.maxMemoryBytes ?? engineLimits.hardMemoryBudgetBytes,
    qualityExplicit: options.quality !== undefined,
    minifyExplicit: options.minifySvg !== undefined,
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const warningSet = new Set<string>(preflight.warnings)
  for (const warning of preEstimate.warnings) {
    warningSet.add(warning)
  }
  for (const issue of backendResult.issues) {
    if (issue.severity === 'warning') {
      warningSet.add(issue.message)
    }
  }

  const labels = resolveTargetLabel(scene, options.target)
  const scaleMode = options.width !== undefined || options.height !== undefined ? 'custom' : 'preset'
  const filename = overrideFilename ?? formatExportFilename(
    filenameTemplate ?? options.filenameTemplate ?? '{document}',
    {
      document: documentTitle ?? options.documentName ?? 'vector-scene',
      target: options.target,
      ...(labels.objectLabel ? { objectLabel: labels.objectLabel } : {}),
      ...(labels.layerLabel ? { layerLabel: labels.layerLabel } : {}),
      scale: options.scale ?? 1,
      scaleMode,
      width: backendResult.width,
      height: backendResult.height,
      format: options.format,
      ...(index !== undefined ? { index } : {}),
    },
  )

  const arrayBuffer = new ArrayBuffer(backendResult.data.byteLength)
  new Uint8Array(arrayBuffer).set(backendResult.data)
  const mimeType = backendResult.mimeType || mimeTypeForFormat(options.format)
  const blob = new Blob([arrayBuffer], { type: mimeType })

  return {
    blob,
    data: backendResult.data,
    bytes: backendResult.data,
    filename,
    mimeType,
    extension: backendResult.extension || extensionForFormat(options.format),
    width: backendResult.width,
    height: backendResult.height,
    sizeBytes: backendResult.data.byteLength,
    estimatedBytes: preEstimate.estimatedBytes,
    pixelCount: backendResult.width * backendResult.height,
    memoryBytes: options.format === 'svg' ? 0 : backendResult.width * backendResult.height * 8,
    hasAlpha: backendResult.hasAlpha,
    warnings: [...warningSet],
    durationMs: performance.now() - startedAt,
    bounds: backendResult.bounds ?? viewport.sourceBox,
  }
}

export const buildExportPreview = async (params: {
  backend: EngineBackend
  source: string
  options: ExportOptions
  maxThumbnailDimension?: number
}): Promise<ExportPreviewSnapshot> => {
  const validation = await params.backend.validate(params.source)
  if (!validation.valid || !validation.scene) {
    throw new VectorEngineError('validation.failed', 'Scene validation failed', validation.issues)
  }

  const scene = validation.scene
  const scoped = extractScopedScene(scene, params.options.target, Boolean(params.options.includeHidden))
  const viewport = resolveExportViewport(scene, scoped, params.options)
  const thumbDims = computeThumbnailDimensions(
    viewport.outputWidth,
    viewport.outputHeight,
    params.maxThumbnailDimension ?? engineLimits.thumbnailMaxDimension,
  )

  const effectiveBackground = params.options.format === 'jpeg' && (
    params.options.background === 'transparent'
    || (params.options.background === 'document' && (!scene.document.background || scene.document.background === 'none'))
  )
    ? { color: '#FFFFFF' }
    : params.options.background

  const rendered = await params.backend.renderSvg(params.source, {
    target: params.options.target,
    ...(params.options.includeHidden !== undefined ? { includeHidden: params.options.includeHidden } : {}),
    ...(params.options.trimToBounds !== undefined ? { trimToBounds: params.options.trimToBounds } : {}),
    ...(params.options.clipToBounds !== undefined ? { clipToBounds: params.options.clipToBounds } : {}),
    ...(params.options.margin !== undefined ? { margin: params.options.margin } : {}),
    fitMode: viewport.fitMode,
    ...(params.options.preserveAspectRatio !== undefined ? { preserveAspectRatio: params.options.preserveAspectRatio } : {}),
    ...(params.options.minifySvg !== undefined ? { minifySvg: params.options.minifySvg } : {}),
    background: effectiveBackground,
    width: thumbDims.width,
    height: thumbDims.height,
  })

  const fullSvgForEstimate = params.options.format === 'svg' && !thumbDims.downscaled
    ? rendered.svg
    : null

  const estimate = estimateExportMetrics({
    scene: scoped,
    svgPreview: fullSvgForEstimate,
    format: params.options.format,
    width: viewport.outputWidth,
    height: viewport.outputHeight,
    background: params.options.background,
    ...(params.options.quality !== undefined ? { quality: params.options.quality } : {}),
    ...(params.options.bmpBitDepth !== undefined ? { bmpBitDepth: params.options.bmpBitDepth } : {}),
  })

  return {
    svg: rendered.svg,
    previewWidth: thumbDims.width,
    previewHeight: thumbDims.height,
    outputWidth: viewport.outputWidth,
    outputHeight: viewport.outputHeight,
    viewBox: viewport.viewBox,
    downscaled: thumbDims.downscaled,
    estimate,
  }
}
