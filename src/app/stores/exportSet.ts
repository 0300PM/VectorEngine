import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { createId, iterateNodes } from '@/core/document'
import {
  blobToBytes,
  builtInPresets,
  bytesToBlob,
  createVariant,
  createZipBlob,
  encodeText,
  parseExportPresets,
  planExportSet,
  runExportSet,
  sizeForFormat,
  slugify,
  textEntry,
  type ArchiveEntry,
  type ExportFormat,
  type ExportPreset,
  type ExportScope,
  type ExportSet,
  type ExportSetResult,
  type ExportVariant,
} from '@/formats'
import { downloadBlob } from '../services/download'
import { createExportContext } from '../services/exportContext'
import { formatRegistry } from '../services/formats'
import { useDocumentStore } from './document'
import { useStatusStore } from './status'

export const EXPORT_PRESETS_STORAGE_KEY = 'vector-engine.export-presets'
export const EXPORT_HISTORY_STORAGE_KEY = 'vector-engine.export-history'
export const EXPORT_HISTORY_LIMIT = 10
export const EXPORT_REPORT_FILE_NAME = 'export-report.json'

export const scopeKinds = ['document', 'nodes'] as const
export type ScopeKind = (typeof scopeKinds)[number]

export type ExportHistoryEntry = {
  readonly at: string
  readonly preset: string
  readonly files: number
  readonly failures: number
}

const readJson = (key: string): unknown => {
  const raw = globalThis.localStorage?.getItem(key)
  if (!raw) {
    return undefined
  }
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

const writeJson = (key: string, value: unknown): void => {
  globalThis.localStorage?.setItem(key, JSON.stringify(value))
}

const isHistoryEntry = (value: unknown): value is ExportHistoryEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ExportHistoryEntry).at === 'string' &&
  typeof (value as ExportHistoryEntry).preset === 'string'

const loadHistory = (): ExportHistoryEntry[] => {
  const stored = readJson(EXPORT_HISTORY_STORAGE_KEY)
  return Array.isArray(stored) ? stored.filter(isHistoryEntry) : []
}

const cloneVariants = (variants: readonly ExportVariant[]): ExportVariant[] =>
  variants.map((variant) => ({ ...variant, id: createId('variant') }))

const serializeResult = (result: ExportSetResult): string =>
  JSON.stringify(
    {
      reportVersion: 1,
      files: result.files.map((file) => file.report),
      failures: result.failures,
    },
    null,
    2,
  )

const archiveEntries = async (result: ExportSetResult): Promise<ArchiveEntry[]> => {
  const entries = await Promise.all(
    result.files.map(async (file) => ({
      path: file.fileName,
      bytes: await blobToBytes(file.blob),
    })),
  )
  return [...entries, textEntry(EXPORT_REPORT_FILE_NAME, serializeResult(result))]
}

export const useExportSetStore = defineStore('exportSet', () => {
  const documentStore = useDocumentStore()
  const status = useStatusStore()

  const customPresets = ref<ExportPreset[]>(
    parseExportPresets(readJson(EXPORT_PRESETS_STORAGE_KEY)) ?? [],
  )
  const selectedPresetId = ref(builtInPresets[0]?.id ?? '')
  const variants = ref<ExportVariant[]>(cloneVariants(builtInPresets[0]?.variants ?? []))
  const scopeKind = ref<ScopeKind>('document')
  const scopeNodeIds = ref<string[]>([])
  const scopePadding = ref(0.1)
  const isRunning = ref(false)
  const lastResult = shallowRef<ExportSetResult | undefined>(undefined)
  const history = ref<ExportHistoryEntry[]>(loadHistory())

  const presets = computed<readonly ExportPreset[]>(() => [
    ...builtInPresets,
    ...customPresets.value,
  ])
  const selectedPreset = computed(() =>
    presets.value.find((preset) => preset.id === selectedPresetId.value),
  )
  const baseName = computed(() => slugify(documentStore.document.name))
  const nodeOptions = computed(() =>
    Array.from(iterateNodes(documentStore.document), (visit) => ({
      value: visit.node.id,
      label: `${visit.node.name ?? visit.node.id} (${visit.node.type})`,
    })),
  )
  const scope = computed<ExportScope>(() =>
    scopeKind.value === 'nodes'
      ? { kind: 'nodes', nodeIds: scopeNodeIds.value, padding: scopePadding.value }
      : { kind: 'document' },
  )
  const set = computed<ExportSet>(() => ({
    name: selectedPreset.value?.name ?? 'custom',
    variants: variants.value,
    scope: scope.value,
  }))
  const plan = computed(() =>
    planExportSet(documentStore.document, set.value, {
      baseName: baseName.value,
      registry: formatRegistry,
    }),
  )

  const selectPreset = (id: string): void => {
    const preset = presets.value.find((candidate) => candidate.id === id)
    if (preset) {
      selectedPresetId.value = id
      variants.value = cloneVariants(preset.variants)
    }
  }

  const addVariant = (format: ExportFormat = 'png'): void => {
    variants.value = [
      ...variants.value,
      createVariant({ format, suffix: `-${variants.value.length + 1}` }),
    ]
  }

  const updateVariant = (id: string, patch: Partial<ExportVariant>): void => {
    variants.value = variants.value.map((variant) => {
      if (variant.id !== id) {
        return variant
      }
      const next = { ...variant, ...patch }
      return { ...next, size: sizeForFormat(next.format, next.size) }
    })
  }

  const removeVariant = (id: string): void => {
    variants.value = variants.value.filter((variant) => variant.id !== id)
  }

  const moveVariant = (id: string, offset: number): void => {
    const index = variants.value.findIndex((variant) => variant.id === id)
    const target = index + offset
    if (index === -1 || target < 0 || target >= variants.value.length) {
      return
    }
    const next = [...variants.value]
    const [variant] = next.splice(index, 1)
    if (variant) {
      next.splice(target, 0, variant)
      variants.value = next
    }
  }

  const savePreset = (name: string): void => {
    const trimmed = name.trim()
    if (!trimmed || variants.value.length === 0) {
      return
    }
    const preset: ExportPreset = {
      id: createId('preset'),
      name: trimmed,
      variants: cloneVariants(variants.value),
    }
    customPresets.value = [...customPresets.value, preset]
    selectedPresetId.value = preset.id
    status.report('status.presetSaved', 'success', { name: trimmed })
  }

  const deletePreset = (id: string): void => {
    customPresets.value = customPresets.value.filter((preset) => preset.id !== id)
    if (selectedPresetId.value === id) {
      selectPreset(builtInPresets[0]?.id ?? '')
    }
  }

  const recordHistory = (result: ExportSetResult): void => {
    history.value = [
      {
        at: new Date().toISOString(),
        preset: set.value.name,
        files: result.files.length,
        failures: result.failures.length,
      },
      ...history.value,
    ].slice(0, EXPORT_HISTORY_LIMIT)
  }

  const runExport = async (): Promise<void> => {
    if (!plan.value.ok || isRunning.value) {
      return
    }
    isRunning.value = true
    try {
      const result = await runExportSet(
        documentStore.document,
        set.value,
        baseName.value,
        createExportContext(),
      )
      lastResult.value = result
      recordHistory(result)
      const single = result.files.length === 1 ? result.files[0] : undefined
      if (single && result.failures.length === 0) {
        downloadBlob(single.blob, single.fileName)
      } else if (result.files.length > 0) {
        downloadBlob(
          createZipBlob(await archiveEntries(result)),
          `${baseName.value}-${slugify(set.value.name)}.zip`,
        )
      }
      status.report(
        result.failures.length > 0 ? 'status.exportSetPartial' : 'status.exportSetDone',
        result.failures.length > 0 ? 'warning' : 'success',
        { files: result.files.length, failures: result.failures.length },
      )
    } catch (error) {
      status.report('status.exportFailed', 'error', { message: status.describeError(error) })
    } finally {
      isRunning.value = false
    }
  }

  const downloadReport = (): void => {
    const result = lastResult.value
    if (result) {
      downloadBlob(
        bytesToBlob(encodeText(serializeResult(result)), 'application/json'),
        `${baseName.value}-${EXPORT_REPORT_FILE_NAME}`,
      )
    }
  }

  watch(customPresets, (value) => writeJson(EXPORT_PRESETS_STORAGE_KEY, value), { deep: true })
  watch(history, (value) => writeJson(EXPORT_HISTORY_STORAGE_KEY, value), { deep: true })

  return {
    presets,
    customPresets,
    selectedPresetId,
    selectedPreset,
    variants,
    scopeKind,
    scopeNodeIds,
    scopePadding,
    nodeOptions,
    set,
    plan,
    isRunning,
    lastResult,
    history,
    selectPreset,
    addVariant,
    updateVariant,
    removeVariant,
    moveVariant,
    savePreset,
    deletePreset,
    runExport,
    downloadReport,
  }
})
