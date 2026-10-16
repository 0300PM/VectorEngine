<script setup lang="ts">
import { ref } from 'vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  documentName: string
  canExport: boolean
  exporting: boolean
}>()

const emit = defineEmits<{
  'update:documentName': [value: string]
  import: [file: File]
  reset: []
  export: []
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
</script>

<template>
  <header class="app-header">
    <div class="brand" aria-label="Vector Engine">
      <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#0052FF" />
        <path d="M8 9.5 16 24 24 9.5h-5L16 16l-3-6.5Z" fill="#FFFFFF" />
      </svg>
      <div class="brand-copy">
        <span class="brand-name">VECTOR ENGINE</span>
        <span class="version-badge">v0.1</span>
      </div>
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
