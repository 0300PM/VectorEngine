import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { scaleSizeBy, type PixelSize } from '@/core/scene'
import { createBrowserSurface } from '@/engine'
import {
  encodeRenderResult,
  inspectRasterExport,
  rasterFormatInfo,
  rasterFormats,
  type RasterFormat,
} from '@/formats'
import { downloadBlob, slugify } from '../services/download'
import { useDocumentStore } from './document'
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

  const targetSize = computed<PixelSize | undefined>(() => {
    if (sizeMode.value === 'scale') {
      return scaleSizeBy(renderStore.scene, scale.value)
    }
    return isPositiveInteger(customWidth.value) && isPositiveInteger(customHeight.value)
      ? { width: customWidth.value, height: customHeight.value }
      : undefined
  })

  const warnings = computed(() => inspectRasterExport(renderStore.scene, format.value))

  const baseFileName = computed(() => slugify(documentStore.document.name))

  const exportRasterAs = async (target: RasterFormat): Promise<void> => {
    const size = targetSize.value
    if (!size) {
      status.report('status.invalidSize', 'error')
      return
    }
    const rendered = await renderStore.renderAt(size)
    const blob = await encodeRenderResult(
      rendered,
      { format: target, quality: quality.value },
      createBrowserSurface,
    )
    const fileName = `${baseFileName.value}-${size.width}x${size.height}.${rasterFormatInfo[target].extension}`
    downloadBlob(blob, fileName)
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

  return {
    sizeMode,
    scale,
    customWidth,
    customHeight,
    format,
    quality,
    isExporting,
    targetSize,
    warnings,
    exportRaster,
    exportAllRasters,
  }
})
