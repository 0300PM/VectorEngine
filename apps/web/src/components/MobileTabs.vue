<script setup lang="ts">
import UiIcon from './UiIcon.vue'

export type WorkspaceTab = 'json' | 'preview' | 'properties' | 'export'

const props = defineProps<{ modelValue: WorkspaceTab; errorCount: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: WorkspaceTab] }>()

const tabs: { id: WorkspaceTab; label: string; icon: 'code' | 'preview' | 'layers' | 'export' }[] = [
  { id: 'json', label: 'JSON', icon: 'code' },
  { id: 'preview', label: 'Preview', icon: 'preview' },
  { id: 'properties', label: 'Properties', icon: 'layers' },
  { id: 'export', label: 'Export', icon: 'export' },
]
</script>

<template>
  <nav class="mobile-tabs" aria-label="Workspace panels">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="mobile-tab"
      :class="{ active: props.modelValue === tab.id }"
      type="button"
      @click="emit('update:modelValue', tab.id)"
    >
      <UiIcon :name="tab.icon" />
      <span>{{ tab.label }}</span>
      <span v-if="tab.id === 'json' && props.errorCount" class="tab-error-count">{{ props.errorCount }}</span>
    </button>
  </nav>
</template>
