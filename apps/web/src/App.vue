<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AppHeader from '@/components/AppHeader.vue'
import ExportPanel from '@/components/ExportPanel.vue'
import JsonEditor from '@/components/JsonEditor.vue'
import MobileTabs, { type WorkspaceTab } from '@/components/MobileTabs.vue'
import PreviewPanel from '@/components/PreviewPanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import UiIcon from '@/components/UiIcon.vue'
import { useDebouncedTask } from '@/composables/useDebouncedTask'
import { engineLimits } from '@/engine/limits'
import { useEngineStore } from '@/stores/engine'
import type { BackgroundMode, ExportFormat } from '@/types/engine'
import { downloadBytes, readTextFile, sanitizeFilename } from '@/utils/file'

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
  settings,
  errors,
  warnings,
  objectCount,
  outputWidth,
  outputHeight,
  outputValid,
  canExport,
} = storeToRefs(store)

const activeTab = ref<WorkspaceTab>('preview')
const toasts = ref<Toast[]>([])
let toastId = 0

const previewWidth = computed(() => preview.value?.width ?? scene.value?.document.width ?? 0)
const previewHeight = computed(() => preview.value?.height ?? scene.value?.document.height ?? 0)
const documentBackground = computed(() => {
  const value = scene.value?.document.background
  return value && value !== 'none' ? value : null
})
const exporting = computed(() => renderState.value === 'exporting')

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
  if (!canExport.value) {
    return
  }
  try {
    const result = await store.exportDocument()
    const filename = `${sanitizeFilename(documentName.value)}.${result.extension}`
    downloadBytes(result.data, filename, result.mimeType)
    showToast(`${filename} is ready`, 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Export failed', 'error')
  }
}

const setFormat = (format: ExportFormat): void => store.setFormat(format)
const setScale = (scale: number): void => { settings.value.scale = scale }
const setLock = (locked: boolean): void => { settings.value.lockAspect = locked }
const setBackgroundMode = (mode: BackgroundMode): void => { settings.value.backgroundMode = mode }
const setBackground = (color: string): void => {
  settings.value.background = color
  settings.value.backgroundMode = 'custom'
}
const setQuality = (quality: number): void => { settings.value.quality = Math.min(100, Math.max(1, Math.round(quality))) }

const handleKeyboard = (event: KeyboardEvent): void => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void exportDocument()
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
  <div class="app-shell">
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
        <PreviewPanel
          :svg="preview?.svg ?? null"
          :width="previewWidth"
          :height="previewHeight"
          :object-count="objectCount"
          :render-state="renderState"
          :stale="isStale"
        />
      </div>

      <div class="export-column" :class="{ 'mobile-panel-hidden': activeTab !== 'export' }">
        <ExportPanel
          :settings="settings"
          :output-width="outputWidth"
          :output-height="outputHeight"
          :output-valid="outputValid"
          :document-background="documentBackground"
          :can-export="canExport"
          :exporting="exporting"
          @set-format="setFormat"
          @set-width="store.setWidth"
          @set-height="store.setHeight"
          @set-scale="setScale"
          @set-lock="setLock"
          @set-background-mode="setBackgroundMode"
          @set-background="setBackground"
          @set-quality="setQuality"
          @reset-dimensions="store.resetDimensions"
          @export="exportDocument"
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
