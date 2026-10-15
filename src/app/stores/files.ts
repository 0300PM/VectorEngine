import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { scaleSizeBy } from '@/core/scene'
import { createBrowserSurface } from '@/engine'
import {
  analyzeCompatibility,
  conversionReportBlob,
  conversionReportFileName,
  convertDocument,
  encodeRenderResult,
  type ConversionReport,
  type ReadInput,
} from '@/formats'
import { downloadBlob, slugify } from '../services/download'
import { formatRegistry } from '../services/formats'
import { useDocumentStore } from './document'
import { useRenderStore } from './render'
import { useStatusStore } from './status'

const THUMBNAIL_MAX_SIZE = 256
export const NATIVE_SOURCE_FORMAT = 'document'

export const useFilesStore = defineStore('files', () => {
  const documentStore = useDocumentStore()
  const renderStore = useRenderStore()
  const status = useStatusStore()

  const isBusy = ref(false)
  const targetFormatId = ref(formatRegistry.writers[0]?.id ?? '')
  const lastReport = shallowRef<ConversionReport | undefined>(undefined)

  const writers = computed(() => formatRegistry.writers)
  const acceptedFileTypes = computed(() => formatRegistry.acceptedFileTypes())
  const targetWriter = computed(() => formatRegistry.findWriter(targetFormatId.value))
  const compatibility = computed(() =>
    targetWriter.value
      ? analyzeCompatibility(documentStore.document, targetWriter.value)
      : undefined,
  )
  const isBlocked = computed(() => compatibility.value?.verdict === 'blocked')
  const sourceFormat = computed(() => documentStore.importReport?.formatId ?? NATIVE_SOURCE_FORMAT)

  const guarded = async (task: () => Promise<void>): Promise<void> => {
    isBusy.value = true
    try {
      await task()
    } catch (error) {
      status.report('status.exportFailed', 'error', { message: status.describeError(error) })
    } finally {
      isBusy.value = false
    }
  }

  const renderThumbnail = async (): Promise<Uint8Array> => {
    const scene = renderStore.scene
    const factor = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(scene.width, scene.height))
    const rendered = await renderStore.renderAt(scaleSizeBy(scene, factor))
    const blob = await encodeRenderResult(
      rendered,
      { format: 'png', quality: 1 },
      createBrowserSurface,
    )
    return new Uint8Array(await blob.arrayBuffer())
  }

  const saveAs = (formatId: string = targetFormatId.value): Promise<void> =>
    guarded(async () => {
      const writer = formatRegistry.findWriter(formatId)
      if (!writer) {
        throw new Error(`Unknown writer "${formatId}"`)
      }
      const thumbnail = formatId === 'vex' ? await renderThumbnail() : undefined
      const fileName = `${slugify(documentStore.document.name)}${writer.extensions[0] ?? ''}`
      const outcome = await convertDocument(
        writer,
        documentStore.document,
        { sourceFormat: sourceFormat.value, fileName },
        thumbnail ? { thumbnail } : {},
      )
      lastReport.value = outcome.report
      downloadBlob(outcome.blob, fileName)
      status.report('status.exported', 'success', { fileName })
    })

  const downloadReport = (): void => {
    const report = lastReport.value
    if (report) {
      downloadBlob(conversionReportBlob(report), conversionReportFileName(report))
    }
  }

  const importFile = (file: File): Promise<void> =>
    guarded(async () => {
      const input: ReadInput = {
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }
      const reader = formatRegistry.findReader(input)
      if (!reader) {
        status.report('status.unsupportedFile', 'error', { fileName: file.name })
        return
      }
      const result = await reader.read(input)
      if (!result.ok) {
        documentStore.reportImportFailure(result.error.issues)
        status.report('status.importFailed', 'error', { fileName: file.name })
        return
      }
      documentStore.replaceDocument(result.value.document, {
        fileName: file.name,
        formatId: reader.id,
        formatLabel: reader.label,
        warnings: result.value.warnings,
      })
      status.report('status.imported', 'success', { fileName: file.name, format: reader.label })
    })

  return {
    isBusy,
    writers,
    acceptedFileTypes,
    targetFormatId,
    targetWriter,
    compatibility,
    isBlocked,
    lastReport,
    saveAs,
    downloadReport,
    importFile,
  }
})
