import { VectorEngineError } from '@/engine/errors'
import type { EngineBackend } from '@/types/engine'
import type { VectorScene } from '@/types/scene'
import { extractScopedScene, resolveExportViewport } from './bounds'
import { executeExport } from './exportService'
import { FilenameCollisionResolver, formatExportFilename, sanitizeSegment } from './filename'
import type {
  BatchExportItemInput,
  BatchExportItemState,
  BatchExportReport,
  BatchProgressEvent,
  ExportOptions,
} from './types'
import { createZipArchive } from './zipWriter'

export interface BatchExportParams {
  backend: EngineBackend
  source: string
  documentName?: string
  sharedOptions: ExportOptions
  items: BatchExportItemInput[]
  filenameTemplate?: string
  packageAsZip?: boolean
  zipFilename?: string
  signal?: AbortSignal
  onProgress?: (event: BatchProgressEvent) => void
}

const mergeItemOptions = (
  shared: ExportOptions,
  item: BatchExportItemInput,
  signal?: AbortSignal,
): ExportOptions => {
  const merged: ExportOptions = {
    ...shared,
    ...(item.options ?? {}),
    target: item.target,
    ...(signal ? { signal } : {}),
  }

  if (item.options && item.options.scale !== undefined && item.options.width === undefined && item.options.height === undefined) {
    delete merged.width
    delete merged.height
  }

  return merged
}

export const executeBatchExport = async (params: BatchExportParams): Promise<BatchExportReport> => {
  const startedAt = performance.now()
  const snapshotSource = String(params.source)
  const template = params.filenameTemplate ?? params.sharedOptions.filenameTemplate ?? '{document}_{object}_{scale}'
  const collisionResolver = new FilenameCollisionResolver()

  const validation = await params.backend.validate(snapshotSource)
  const scene: VectorScene | null = validation.valid && validation.scene ? validation.scene : null
  const documentTitle = params.documentName ?? params.sharedOptions.documentName ?? 'vector-scene'

  const states: BatchExportItemState[] = params.items.map((input, index) => {
    const itemOptions = mergeItemOptions(params.sharedOptions, input, params.signal)
    let estimatedW = itemOptions.width ?? scene?.document.width ?? 1
    let estimatedH = itemOptions.height ?? scene?.document.height ?? 1
    if (scene) {
      const scoped = extractScopedScene(scene, input.target, Boolean(itemOptions.includeHidden))
      const viewport = resolveExportViewport(scene, scoped, itemOptions)
      estimatedW = viewport.outputWidth
      estimatedH = viewport.outputHeight
    }
    const candidateName = formatExportFilename(template, {
      document: documentTitle,
      target: input.target,
      objectLabel: input.label,
      scale: itemOptions.scale ?? 1,
      scaleMode: itemOptions.width !== undefined || itemOptions.height !== undefined ? 'custom' : 'preset',
      width: estimatedW,
      height: estimatedH,
      format: itemOptions.format,
      index,
    })
    const safeName = collisionResolver.claim(input.id, candidateName)
    return {
      id: input.id,
      label: input.label,
      target: input.target,
      status: 'pending',
      filename: safeName,
      warnings: [],
    }
  })

  const notify = (currentIndex: number): void => {
    const cur = states[currentIndex]
    params.onProgress?.({
      completed: states.filter((s) => s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled').length,
      total: states.length,
      ...(cur ? { currentItem: { ...cur } } : {}),
      items: states.map((s) => ({ ...s })),
    })
  }

  let cancelled = false

  for (let index = 0; index < params.items.length; index += 1) {
    const input = params.items[index]!
    const state = states[index]!

    if (params.signal?.aborted) {
      cancelled = true
      state.status = 'cancelled'
      notify(index)
      continue
    }

    state.status = 'running'
    notify(index)

    const itemOptions = mergeItemOptions(params.sharedOptions, input, params.signal)

    try {
      const result = await executeExport({
        backend: params.backend,
        source: snapshotSource,
        options: itemOptions,
        documentTitle,
        filenameTemplate: template,
        index,
        overrideFilename: state.filename,
      })
      state.status = 'completed'
      state.filename = result.filename
      state.sizeBytes = result.sizeBytes
      state.durationMs = result.durationMs
      state.warnings = result.warnings
      state.result = result
    } catch (error) {
      if (params.signal?.aborted || (error instanceof VectorEngineError && error.code === 'export.cancelled')) {
        cancelled = true
        state.status = 'cancelled'
      } else {
        state.status = 'failed'
        state.error = {
          code: error instanceof VectorEngineError ? error.code : 'batch.itemFailed',
          message: error instanceof Error ? error.message : 'Item export failed',
        }
      }
    }

    notify(index)
  }

  const succeeded = states.filter((item) => item.status === 'completed' && item.result)
  const failedCount = states.filter((item) => item.status === 'failed').length
  const cancelledCount = states.filter((item) => item.status === 'cancelled').length

  let zipBlob: Blob | undefined
  let zipData: Uint8Array | undefined
  let zipFilename: string | undefined

  if (params.packageAsZip && succeeded.length > 0 && !cancelled) {
    zipData = await createZipArchive(
      succeeded.map((item) => ({
        filename: item.filename,
        data: item.result!.data,
      })),
    )
    const zipBuffer = new ArrayBuffer(zipData.byteLength)
    new Uint8Array(zipBuffer).set(zipData)
    zipBlob = new Blob([zipBuffer], { type: 'application/zip' })
    const rawZipName = params.zipFilename?.trim() || `${sanitizeSegment(documentTitle, 'vector-export')}-batch.zip`
    zipFilename = rawZipName.endsWith('.zip') ? rawZipName : `${rawZipName}.zip`
  }

  let totalBytes = 0
  for (const item of succeeded) {
    totalBytes += item.sizeBytes ?? 0
  }

  return {
    items: states,
    succeeded: succeeded.length,
    failed: failedCount,
    cancelledCount,
    totalBytes,
    totalDurationMs: performance.now() - startedAt,
    collisions: collisionResolver.collisions,
    cancelled,
    ...(zipBlob ? { zipBlob } : {}),
    ...(zipData ? { zipData } : {}),
    ...(zipFilename ? { zipFilename } : {}),
  }
}
