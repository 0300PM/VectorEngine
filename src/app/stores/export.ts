import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { scaleSizeBy, type PixelSize } from '@/core/scene'
import { createBrowserSurface } from '@/engine'
import {
  analyzeRasterExport,
  conversionReportBlob,
  conversionReportFileName,
  exportRaster as exportRasterDocument,
  rasterFormatInfo,
  rasterFormats,
  type ConversionReport,
  type RasterFormat,
} from '@/formats'
import { downloadBlob, slugify } from '../services/download'
import { useDocumentStore } from './document'
import { NATIVE_SOURCE_FORMAT } from './files'
import { useRenderStore } from './render'
import { useStatusStore } from './status'

export const sizeModes = ['scale', 'custom'] as const
export type SizeMode = (typeof sizeModes)[number]

export const scalePresets = [0.5, 1, 2, 3, 4] as const

export const DEFAULT_QUALITY = 0.92

const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0

export const useExportStore = defineStore('export', () => {
  const documentStore = useDocumentStore()
  const renderStore = useRenderStore()
  const status = useStatusStore()

  const sizeMode = ref<SizeMode>('scale')
  const scale = ref<number>(1)
  const customWidth = ref(1920)
  const customHeight = ref(1080)
  const format = ref<RasterFormat>('png')
  const quality = ref(DEFAULT_QUALITY)
  const isExporting = ref(false)
  const lastReport = shallowRef<ConversionReport | undefined>(undefined)

  const targetSize = computed<PixelSize | undefined>(() => {
    if (sizeMode.value === 'scale') {
      return scaleSizeBy(renderStore.scene, scale.value)
    }
    return isPositiveInteger(customWidth.value) && isPositiveInteger(customHeight.value)
      ? { width: customWidth.value, height: customHeight.value }
      : undefined
  })

  const compatibility = computed(() => analyzeRasterExport(documentStore.document, format.value))
  const isBlocked = computed(() => compatibility.value.verdict === 'blocked')

  const baseFileName = computed(() => slugify(documentStore.document.name))

  const exportRasterAs = async (target: RasterFormat): Promise<void> => {
    const size = targetSize.value
    if (!size) {
      status.report('status.invalidSize', 'error')
      return
    }
    const rendered = await renderStore.renderAt(size)
    const fileName = `${baseFileName.value}-${size.width}x${size.height}.${rasterFormatInfo[target].extension}`
    const outcome = await exportRasterDocument(
      {
        document: documentStore.document,
        build: renderStore.sceneBuild,
        result: rendered,
        options: { format: target, quality: quality.value },
        fileName,
        sourceFormat: documentStore.importReport?.formatId ?? NATIVE_SOURCE_FORMAT,
      },
      createBrowserSurface,
    )
    lastReport.value = outcome.report
    downloadBlob(outcome.blob, fileName)
    status.report('status.exported', 'success', { fileName })
  }

  const guarded = async (task: () => Promise<void>): Promise<void> => {
    isExporting.value = true
    try {
      await task()
    } catch (error) {
      status.report('status.exportFailed', 'error', { message: status.describeError(error) })
    } finally {
      isExporting.value = false
    }
  }

  const exportRaster = (): Promise<void> => guarded(() => exportRasterAs(format.value))

  const exportAllRasters = (): Promise<void> =>
    guarded(async () => {
      for (const target of rasterFormats) {
        await exportRasterAs(target)
      }
    })

  const downloadReport = (): void => {
    const report = lastReport.value
    if (report) {
      downloadBlob(conversionReportBlob(report), conversionReportFileName(report))
    }
  }

  return {
    sizeMode,
    scale,
    customWidth,
    customHeight,
    format,
    quality,
    isExporting,
    targetSize,
    compatibility,
    isBlocked,
    lastReport,
    exportRaster,
    exportAllRasters,
    downloadReport,
  }
})
