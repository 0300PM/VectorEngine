<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AppBanner from '@/components/AppBanner.vue'
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
import type { PanelId } from '@/stores/engine'
import { COLLAPSIBLE_PANELS, useEngineStore } from '@/stores/engine'
import type { IconName } from '@/ui/icons'
import { readTextFile } from '@/utils/file'
import { useMediaQuery } from '@/composables/useMediaQuery'

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
  panelVisible,
  panelCollapsed,
  bannerVisible,
} = storeToRefs(store)

const activeTab = ref<WorkspaceTab>('preview')
const isDesktop = useMediaQuery('(min-width: 901px)')
const toasts = ref<Toast[]>([])
let toastId = 0

const previewWidth = computed(() => preview.value?.width ?? scene.value?.document.width ?? 0)
const previewHeight = computed(() => preview.value?.height ?? scene.value?.document.height ?? 0)

const panelDefinitions: { id: PanelId; label: string; icon: IconName }[] = [
  { id: 'json', label: 'Source', icon: 'code' },
  { id: 'properties', label: 'Properties', icon: 'layers' },
  { id: 'export', label: 'Export', icon: 'export' },
  { id: 'toolbar', label: 'Path toolbar', icon: 'pen' },
  { id: 'statusbar', label: 'Status bar', icon: 'info' },
]

const isCollapsiblePanel = (id: PanelId): id is 'json' | 'properties' | 'export' =>
  id === 'json' || id === 'properties' || id === 'export'

const panelToggles = computed(() =>
  panelDefinitions.map((panel) => ({
    ...panel,
    visible: panelVisible.value[panel.id],
    collapsible: isCollapsiblePanel(panel.id),
    collapsed: isCollapsiblePanel(panel.id) ? panelCollapsed.value[panel.id] : false,
  })),
)

const panelRailLabel: Record<'json' | 'properties' | 'export', { title: string; eyebrow: string }> = {
  json: { title: 'Source', eyebrow: 'SOURCE' },
  properties: { title: 'Inspector', eyebrow: 'PROPERTIES' },
  export: { title: 'Export', eyebrow: 'OUTPUT' },
}

const isRail = (id: 'json' | 'properties' | 'export'): boolean =>
  isDesktop.value && panelVisible.value[id] && panelCollapsed.value[id]

/**
 * Header toggles cycle through three states on desktop:
 * expanded → collapsed rail → hidden → expanded.
 */
const togglePanelFromHeader = (id: PanelId): void => {
  if (!isCollapsiblePanel(id) || !isDesktop.value) {
    store.togglePanel(id)
    return
  }
  if (!panelVisible.value[id]) {
    store.setPanelVisible(id, true)
    store.setPanelCollapsed(id, false)
    return
  }
  if (!panelCollapsed.value[id]) {
    store.setPanelCollapsed(id, true)
    return
  }
  store.setPanelVisible(id, false)
}

const exitRails = (): void => {
  store.expandPanels()
}

const allRails = computed(
  () => isDesktop.value && COLLAPSIBLE_PANELS.every((id) => panelVisible.value[id] && panelCollapsed.value[id]),
)

const workspaceColumns = computed(() => {
  if (fullscreen.value) {
    return 'minmax(0, 1fr)'
  }
  const tracks: string[] = []
  if (panelVisible.value.json) {
    tracks.push(isRail('json') ? 'var(--rail)' : 'var(--col-source)')
  }
  tracks.push('var(--col-preview)')
  if (panelVisible.value.properties) {
    tracks.push(isRail('properties') ? 'var(--rail)' : 'var(--col-properties)')
  }
  if (panelVisible.value.export) {
    tracks.push(isRail('export') ? 'var(--rail)' : 'var(--col-export)')
  }
  return tracks.join(' ')
})
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
      :panel-toggles="panelToggles"
      :banner-visible="bannerVisible"
      @update:document-name="documentName = $event"
      @toggle-panel="togglePanelFromHeader"
      @toggle-banner="bannerVisible ? store.dismissBanner() : store.showBanner()"
      @import="importFile"
      @reset="resetDocument"
      @export="exportDocument"
    />

    <AppBanner v-if="bannerVisible && !fullscreen" @dismiss="store.dismissBanner()" />

    <MobileTabs v-model="activeTab" :error-count="errors.length" />

    <main class="workspace" :style="{ gridTemplateColumns: workspaceColumns }">
      <div
        class="editor-column"
        :class="{
          'panel-hidden': !panelVisible.json,
          'mobile-panel-hidden': activeTab !== 'json',
          'is-collapsed': isRail('json'),
        }"
      >
        <div
          v-if="isRail('json')"
          class="panel-rail"
          role="button"
          tabindex="0"
          :title="`Expand ${panelRailLabel.json.title}`"
          :aria-label="`Expand ${panelRailLabel.json.title} panel`"
          @click="store.setPanelCollapsed('json', false)"
          @keydown.enter.prevent="store.setPanelCollapsed('json', false)"
          @keydown.space.prevent="store.setPanelCollapsed('json', false)"
        >
          <UiIcon name="code" :size="14" />
          <span class="panel-rail-label">{{ panelRailLabel.json.title }}</span>
          <span class="panel-rail-eyebrow">{{ panelRailLabel.json.eyebrow }}</span>
        </div>
        <JsonEditor
          v-show="!isRail('json')"
          :model-value="source"
          :issues="issues"
          :render-state="renderState"
          @update:model-value="updateSource"
          @format="formatJson"
          @collapse="store.setPanelCollapsed('json', true)"
        />
      </div>

      <div class="preview-column" :class="{ 'mobile-panel-hidden': activeTab !== 'preview' }">
        <PathToolbar v-show="panelVisible.toolbar" />
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

      <div
        class="inspector-column"
        :class="{
          'panel-hidden': !panelVisible.properties,
          'mobile-panel-hidden': activeTab !== 'properties',
          'is-collapsed': isRail('properties'),
        }"
      >
        <div
          v-if="isRail('properties')"
          class="panel-rail"
          role="button"
          tabindex="0"
          :title="`Expand ${panelRailLabel.properties.title}`"
          :aria-label="`Expand ${panelRailLabel.properties.title} panel`"
          @click="store.setPanelCollapsed('properties', false)"
          @keydown.enter.prevent="store.setPanelCollapsed('properties', false)"
          @keydown.space.prevent="store.setPanelCollapsed('properties', false)"
        >
          <UiIcon name="layers" :size="14" />
          <span class="panel-rail-label">{{ panelRailLabel.properties.title }}</span>
          <span class="panel-rail-eyebrow">{{ panelRailLabel.properties.eyebrow }}</span>
        </div>
        <PropertiesInspector
          v-show="!isRail('properties')"
          @collapse="store.setPanelCollapsed('properties', true)"
        />
      </div>

      <div
        class="export-column"
        :class="{
          'panel-hidden': !panelVisible.export,
          'mobile-panel-hidden': activeTab !== 'export',
          'is-collapsed': isRail('export'),
        }"
      >
        <div
          v-if="isRail('export')"
          class="panel-rail"
          role="button"
          tabindex="0"
          :title="`Expand ${panelRailLabel.export.title}`"
          :aria-label="`Expand ${panelRailLabel.export.title} panel`"
          @click="store.setPanelCollapsed('export', false)"
          @keydown.enter.prevent="store.setPanelCollapsed('export', false)"
          @keydown.space.prevent="store.setPanelCollapsed('export', false)"
        >
          <UiIcon name="export" :size="14" />
          <span class="panel-rail-label">{{ panelRailLabel.export.title }}</span>
          <span class="panel-rail-eyebrow">{{ panelRailLabel.export.eyebrow }}</span>
        </div>
        <ExportPanel
          v-show="!isRail('export')"
          @export="exportDocument"
          @export-batch="exportBatchDocuments"
          @collapse="store.setPanelCollapsed('export', true)"
        />
      </div>

      <div v-if="isDesktop && allRails" class="workspace-restore">
        <button type="button" class="workspace-restore-button" @click="exitRails">
          <UiIcon name="expand" :size="14" />
          Restore panels
        </button>
      </div>
    </main>

    <StatusBar
      v-show="panelVisible.statusbar"
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
