import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { scaleSizeBy } from '@/core/scene'
import { createBrowserSurface } from '@/engine'
import { encodeRenderResult, type FormatWarning, type ReadInput } from '@/formats'
import { downloadBlob, slugify } from '../services/download'
import { formatRegistry } from '../services/formats'
import { useDocumentStore } from './document'
import { useRenderStore } from './render'
import { useStatusStore } from './status'

const THUMBNAIL_MAX_SIZE = 256

export const useFilesStore = defineStore('files', () => {
  const documentStore = useDocumentStore()
  const renderStore = useRenderStore()
  const status = useStatusStore()

  const isBusy = ref(false)

  const writers = computed(() => formatRegistry.writers)
  const acceptedFileTypes = computed(() => formatRegistry.acceptedFileTypes())
  const writerWarnings = computed<Readonly<Record<string, readonly FormatWarning[]>>>(() =>
    Object.fromEntries(
      formatRegistry.writers.map((writer) => [writer.id, writer.inspect(documentStore.document)]),
    ),
  )

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

  const saveAs = (formatId: string): Promise<void> =>
    guarded(async () => {
      const writer = formatRegistry.findWriter(formatId)
      if (!writer) {
        throw new Error(`Unknown writer "${formatId}"`)
      }
      const thumbnail = formatId === 'vex' ? await renderThumbnail() : undefined
      const blob = await writer.write(documentStore.document, thumbnail ? { thumbnail } : {})
      const fileName = `${slugify(documentStore.document.name)}${writer.extensions[0] ?? ''}`
      downloadBlob(blob, fileName)
      status.report('status.exported', 'success', { fileName })
    })

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

  return { isBusy, writers, acceptedFileTypes, writerWarnings, saveAs, importFile }
})
