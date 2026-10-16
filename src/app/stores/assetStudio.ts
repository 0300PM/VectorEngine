import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  blobToBytes,
  createZipBlob,
  defaultAppIconOptions,
  defaultFaviconOptions,
  runAppIconStudio,
  runFaviconStudio,
  type AppIconOptions,
  type ArchiveEntry,
  type AssetStudioResult,
  type BackgroundMode,
  type FaviconOptions,
  type VariantBackground,
} from '@/formats'
import { downloadBlob } from '../services/download'
import { createExportContext } from '../services/exportContext'
import { useDocumentStore } from './document'
import { useStatusStore } from './status'

export const assetKinds = ['favicon', 'app-icons'] as const
export type AssetKind = (typeof assetKinds)[number]

export const useAssetStudioStore = defineStore('assetStudio', () => {
  const documentStore = useDocumentStore()
  const status = useStatusStore()

  const kind = ref<AssetKind>('favicon')
  const appName = ref(documentStore.document.name)
  const themeColor = ref('#ffffff')
  const backgroundMode = ref<BackgroundMode>('transparent')
  const backgroundColor = ref('#ffffff')
  const padding = ref(0.1)
  const includeSvg = ref(true)
  const monochrome = ref(false)
  const monochromeColor = ref('#ffffff')
  const dark = ref(false)
  const darkBackground = ref('#000000')
  const isRunning = ref(false)
  const lastResult = shallowRef<AssetStudioResult | undefined>(undefined)
  const html = ref('')

  const background = computed<VariantBackground>(() =>
    backgroundMode.value === 'color'
      ? { mode: 'color', color: backgroundColor.value }
      : { mode: backgroundMode.value },
  )

  const faviconOptions = computed<FaviconOptions>(() => ({
    ...defaultFaviconOptions,
    appName: appName.value.trim() || defaultFaviconOptions.appName,
    themeColor: themeColor.value,
    background: background.value,
    padding: padding.value,
    includeSvg: includeSvg.value,
  }))

  const appIconOptions = computed<AppIconOptions>(() => ({
    ...defaultAppIconOptions,
    background: background.value,
    padding: padding.value,
    ...(monochrome.value ? { monochrome: monochromeColor.value } : {}),
    ...(dark.value
      ? { dark: { background: darkBackground.value, recolor: monochromeColor.value } }
      : {}),
  }))

  const archive = async (result: AssetStudioResult): Promise<Blob> => {
    const entries: ArchiveEntry[] = await Promise.all(
      [...result.files, ...result.extras].map(async (file) => ({
        path: file.fileName,
        bytes: await blobToBytes(file.blob),
      })),
    )
    return createZipBlob(entries)
  }

  const run = async (): Promise<void> => {
    if (isRunning.value) {
      return
    }
    isRunning.value = true
    try {
      const context = createExportContext()
      const result =
        kind.value === 'favicon'
          ? await runFaviconStudio(documentStore.document, faviconOptions.value, context)
          : await runAppIconStudio(documentStore.document, appIconOptions.value, context)
      lastResult.value = result
      html.value = 'html' in result && typeof result.html === 'string' ? result.html : ''
      if (result.files.length > 0) {
        downloadBlob(await archive(result), `${kind.value}.zip`)
      }
      status.report(
        result.failures.length > 0 || result.problems.length > 0
          ? 'status.assetsPartial'
          : 'status.assetsDone',
        result.failures.length > 0 ? 'warning' : 'success',
        { files: result.files.length, problems: result.problems.length + result.failures.length },
      )
    } catch (error) {
      status.report('status.exportFailed', 'error', { message: status.describeError(error) })
    } finally {
      isRunning.value = false
    }
  }

  return {
    kind,
    appName,
    themeColor,
    backgroundMode,
    backgroundColor,
    padding,
    includeSvg,
    monochrome,
    monochromeColor,
    dark,
    darkBackground,
    isRunning,
    lastResult,
    html,
    run,
  }
})
