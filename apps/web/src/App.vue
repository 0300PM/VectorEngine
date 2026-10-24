<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AppHeader from '@/components/AppHeader.vue'
import ExportPanel from '@/components/ExportPanel.vue'
import JsonEditor from '@/components/JsonEditor.vue'
import MobileTabs, { type WorkspaceTab } from '@/components/MobileTabs.vue'
import PathToolbar from '@/components/PathToolbar.vue'
import PropertiesInspector from '@/components/PropertiesInspector.vue'
import PreviewPanel from '@/components/PreviewPanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import UiIcon from '@/components/UiIcon.vue'
import { useDebouncedTask } from '@/composables/useDebouncedTask'
import { findObjectsById } from '@/inspector/sceneTree'
import { parsePathObject, type PathCommand } from '@/paths/editor'
import type { PathModel } from '@/paths/model'
import { engineLimits } from '@/engine/limits'
import { useEngineStore } from '@/stores/engine'
import { readTextFile } from '@/utils/file'

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

const store = useEngineStore()
const {
  source,
  documentName,
  backendName,
  renderState,
  issues,
  scene,
  preview,
  lastDuration,
  isStale,
  errors,
  warnings,
  objectCount,
  outputWidth,
  outputHeight,
  canExport,
  editorBackdrop,
  selectedObjectIds,
  pathTool,
  nodeEditing,
  fullscreen,
} = storeToRefs(store)

const activeTab = ref<WorkspaceTab>('preview')
const toasts = ref<Toast[]>([])
let toastId = 0

const previewWidth = computed(() => preview.value?.width ?? scene.value?.document.width ?? 0)
const previewHeight = computed(() => preview.value?.height ?? scene.value?.document.height ?? 0)
const exporting = computed(() => renderState.value === 'exporting')

const selectedPathModel = computed<PathModel | null>(() => {
  if (!scene.value) {
    return null
  }
  const object = findObjectsById(scene.value, selectedObjectIds.value).find(
    (item) => item.type === 'path',
  )
  return object ? parsePathObject(object) : null
})

const handlePathCommand = (command: PathCommand): void => {
  store.applyPathCommandToSelection(command)
}

const handlePathCreate = (model: PathModel, name: string): void => {
  store.addPathFromModel(model, name)
}

const handlePathCancel = (): void => {
  store.setPathTool('select')
  store.setNodeEditing(false)
}

const handlePathSelect = (subpath: number, node: number): void => {
  store.setSelectedNode(subpath, node)
}

const showToast = (message: string, type: Toast['type']): void => {
  const id = ++toastId
  toasts.value.push({ id, type, message })
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }, 3600)
}

const { schedule: scheduleRender, cancel: cancelScheduledRender } = useDebouncedTask(store.render, 260)

const updateSource = (value: string): void => {
  store.setSource(value)
  scheduleRender()
}

const formatJson = (): void => {
  try {
    store.formatSource()
    cancelScheduledRender()
    void store.render()
    showToast('JSON formatted', 'success')
  } catch {
    showToast('Fix JSON syntax before formatting', 'error')
  }
}

const importFile = async (file: File): Promise<void> => {
  try {
    const content = await readTextFile(file, engineLimits.sourceBytes)
    store.setSource(content)
    documentName.value = file.name.replace(/\.json$/i, '') || 'Imported scene'
    cancelScheduledRender()
    await store.render()
    activeTab.value = errors.value.length ? 'json' : 'preview'
    showToast(`Imported ${file.name}`, 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Unable to import file', 'error')
  }
}

const resetDocument = (): void => {
  store.reset()
  cancelScheduledRender()
  void store.render()
  activeTab.value = 'preview'
  showToast('Example scene restored', 'success')
}

const exportDocument = async (): Promise<void> => {
  try {
    const result = await store.exportCurrent()
    if (result) {
      showToast(`${result.filename} is ready`, 'success')
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Export failed', 'error')
  }
}

const exportBatchDocuments = async (): Promise<void> => {
  try {
    const report = await store.exportBatch()
    if (report && !report.cancelled) {
      showToast(
        report.zipFilename
          ? `${report.zipFilename} is ready`
          : `Exported ${report.succeeded} files`,
        'success',
      )
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Batch export failed', 'error')
  }
}

const handleKeyboard = (event: KeyboardEvent): void => {
  if (!(event.ctrlKey || event.metaKey)) {
    return
  }
  const key = event.key.toLowerCase()

  if (key === 's') {
    event.preventDefault()
    if (store.batchMode) {
      void exportBatchDocuments()
    } else {
      void exportDocument()
    }
    return
  }

  if (key === 'z') {
    event.preventDefault()
    if (event.shiftKey) {
      store.redo()
    } else {
      store.undo()
    }
    return
  }

  if (key === 'y') {
    event.preventDefault()
    store.redo()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyboard)
  void store.initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboard)
  store.dispose()
})
</script>

<template>
  <div class="app-shell" :class="{ 'is-fullscreen': fullscreen }">
    <AppHeader
      :document-name="documentName"
      :can-export="canExport"
      :exporting="exporting"
      @update:document-name="documentName = $event"
      @import="importFile"
      @reset="resetDocument"
      @export="exportDocument"
    />

    <MobileTabs v-model="activeTab" :error-count="errors.length" />

    <main class="workspace">
      <div class="editor-column" :class="{ 'mobile-panel-hidden': activeTab !== 'json' }">
        <JsonEditor
          :model-value="source"
          :issues="issues"
          :render-state="renderState"
          @update:model-value="updateSource"
          @format="formatJson"
        />
      </div>

      <div class="preview-column" :class="{ 'mobile-panel-hidden': activeTab !== 'preview' }">
        <PathToolbar />
        <PreviewPanel
          :svg="preview?.svg ?? null"
          :width="previewWidth"
          :height="previewHeight"
          :object-count="objectCount"
          :render-state="renderState"
          :stale="isStale"
          :backdrop="editorBackdrop"
          :path-model="selectedPathModel"
          :path-tool="pathTool"
          :node-editing="nodeEditing"
          @update:backdrop="editorBackdrop = $event"
          @path-command="handlePathCommand"
          @path-create="handlePathCreate"
          @path-select="handlePathSelect"
          @path-cancel="handlePathCancel"
        />
      </div>

      <div class="inspector-column" :class="{ 'mobile-panel-hidden': activeTab !== 'properties' }">
        <PropertiesInspector />
      </div>

      <div class="export-column" :class="{ 'mobile-panel-hidden': activeTab !== 'export' }">
        <ExportPanel
          @export="exportDocument"
          @export-batch="exportBatchDocuments"
        />
      </div>
    </main>

    <StatusBar
      :render-state="renderState"
      :error-count="errors.length"
      :warning-count="warnings.length"
      :duration="lastDuration"
      :backend-name="backendName"
      :output-width="outputWidth"
      :output-height="outputHeight"
    />

    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.type">
        <UiIcon :name="toast.type === 'success' ? 'check' : 'alert'" :size="15" />
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </div>
</template>
