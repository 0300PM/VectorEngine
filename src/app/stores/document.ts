import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  countNodes,
  parseDocumentJson,
  serializeDocument,
  setLayerVisibility as setDocumentLayerVisibility,
  touchDocument,
  type DocumentIssue,
  type VectorDocument,
} from '@/core/document'
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '@/core/history'
import type { FormatWarning } from '@/formats'
import { createSampleDocument } from '../documents/sample'
import { useStatusStore } from './status'

export type ImportReport = {
  readonly fileName: string
  readonly formatId: string
  readonly formatLabel: string
  readonly warnings: readonly FormatWarning[]
}

export const useDocumentStore = defineStore('document', () => {
  const status = useStatusStore()

  const history = shallowRef(createHistory(createSampleDocument()))
  const source = ref(serializeDocument(history.value.present))
  const issues = shallowRef<readonly DocumentIssue[]>([])
  const importReport = shallowRef<ImportReport | undefined>(undefined)

  const document = computed(() => history.value.present)
  const serialized = computed(() => serializeDocument(document.value))
  const isDirty = computed(() => source.value.trim() !== serialized.value)
  const isValid = computed(() => issues.value.length === 0)
  const canUndo = computed(() => historyCanUndo(history.value))
  const canRedo = computed(() => historyCanRedo(history.value))
  const nodeCount = computed(() => countNodes(document.value))

  const syncSource = (): void => {
    source.value = serializeDocument(document.value)
    issues.value = []
  }

  const commit = (next: VectorDocument): void => {
    history.value = pushHistory(history.value, next)
    syncSource()
  }

  const validateSource = (): boolean => {
    const result = parseDocumentJson(source.value)
    issues.value = result.ok ? [] : result.error
    return result.ok
  }

  const applySource = (): boolean => {
    const result = parseDocumentJson(source.value)
    if (!result.ok) {
      issues.value = result.error
      status.report('status.invalidDocument', 'warning')
      return false
    }
    commit(touchDocument(result.value))
    status.report('status.applied', 'success')
    return true
  }

  const replaceDocument = (next: VectorDocument, report?: ImportReport): void => {
    commit(next)
    importReport.value = report
  }

  const reportImportFailure = (failureIssues: readonly DocumentIssue[]): void => {
    issues.value = failureIssues
  }

  const undo = (): void => {
    history.value = undoHistory(history.value)
    syncSource()
  }

  const redo = (): void => {
    history.value = redoHistory(history.value)
    syncSource()
  }

  const setLayerVisibility = (layerId: string, visible: boolean): void => {
    commit(setDocumentLayerVisibility(document.value, layerId, visible))
  }

  const loadSample = (): void => {
    importReport.value = undefined
    commit(createSampleDocument())
  }

  return {
    document,
    source,
    issues,
    importReport,
    isDirty,
    isValid,
    canUndo,
    canRedo,
    nodeCount,
    validateSource,
    applySource,
    replaceDocument,
    reportImportFailure,
    undo,
    redo,
    setLayerVisibility,
    loadSample,
  }
})
