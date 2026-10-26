<script setup lang="ts">
import { ref } from 'vue'
import type { PanelId } from '@/stores/engine'
import type { IconName } from '@/ui/icons'
import UiIcon from './UiIcon.vue'

interface PanelToggle {
  id: PanelId
  label: string
  icon: IconName
  visible: boolean
  collapsible?: boolean
  collapsed?: boolean
}

const props = defineProps<{
  documentName: string
  canExport: boolean
  exporting: boolean
  panelToggles: PanelToggle[]
  bannerVisible: boolean
}>()

const emit = defineEmits<{
  'update:documentName': [value: string]
  import: [file: File]
  reset: []
  export: []
  togglePanel: [id: PanelId]
  toggleBanner: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const openFilePicker = (): void => fileInput.value?.click()

const handleFile = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('import', file)
  }
  input.value = ''
}

const toggleLabel = (panel: PanelToggle): string => {
  if (!panel.collapsible) {
    return `${panel.label}: ${panel.visible ? 'Hide' : 'Show'}`
  }
  if (!panel.visible) {
    return `${panel.label}: Show`
  }
  return panel.collapsed ? `${panel.label}: Hide` : `${panel.label}: Collapse`
}

const toggleStateLabel = (panel: PanelToggle): string => {
  if (panel.collapsed) {
    return 'collapsed'
  }
  return panel.visible ? 'shown' : 'hidden'
}
</script>

<template>
  <header class="app-header">
    <div class="brand" aria-label="Vector Engine">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
          <rect x="1" y="1" width="30" height="30" rx="8" fill="#0052FF" />
          <path d="M9 10.5v11l7 4.5 7-4.5v-11l-7-4.5z" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round" />
          <circle cx="16" cy="16" r="3.4" fill="#FFFFFF" />
        </svg>
      </span>
      <div class="brand-copy">
        <span class="brand-name">VECTOR ENGINE</span>
        <span class="version-badge">v0.1</span>
      </div>
      <button
        class="banner-toggle"
        :class="{ active: props.bannerVisible }"
        type="button"
        :aria-pressed="props.bannerVisible"
        :title="props.bannerVisible ? 'Hide banner' : 'Show banner'"
        aria-label="Toggle product banner"
        @click="emit('toggleBanner')"
      >
        <UiIcon name="info" :size="14" />
      </button>
    </div>

    <div class="document-title-wrap">
      <input
        class="document-title"
        :value="props.documentName"
        aria-label="Document name"
        maxlength="80"
        spellcheck="false"
        @input="emit('update:documentName', ($event.target as HTMLInputElement).value)"
      />
      <span class="saved-indicator">Local document</span>
    </div>

    <nav class="header-actions" aria-label="Document actions">
      <div class="panel-toggles" role="group" aria-label="Workspace panels">
        <button
          v-for="panel in props.panelToggles"
          :key="panel.id"
          class="panel-toggle"
          :class="{ 'is-off': !panel.visible }"
          type="button"
          :aria-pressed="panel.visible && !panel.collapsed"
          :data-state="toggleStateLabel(panel)"
          :title="toggleLabel(panel)"
          :aria-label="toggleLabel(panel)"
          @click="emit('togglePanel', panel.id)"
        >
          <UiIcon :name="panel.icon" :size="15" />
        </button>
      </div>

      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        accept="application/json,.json"
        @change="handleFile"
      />
      <button class="button button-quiet" type="button" aria-label="Import JSON" @click="openFilePicker">
        <UiIcon name="upload" />
        <span class="action-label">Import</span>
      </button>
      <button class="button button-quiet" type="button" aria-label="Reset document" @click="emit('reset')">
        <UiIcon name="reset" />
        <span class="action-label">Reset</span>
      </button>
      <button
        class="button button-primary"
        type="button"
        :disabled="!props.canExport || props.exporting"
        @click="emit('export')"
      >
        <UiIcon :name="props.exporting ? 'spinner' : 'download'" :class="{ spinning: props.exporting }" />
        <span>{{ props.exporting ? 'Exporting' : 'Export' }}</span>
      </button>
    </nav>
  </header>
</template>
