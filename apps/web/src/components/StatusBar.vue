<script setup lang="ts">
import { computed } from 'vue'
import type { RenderState } from '@/types/engine'
import { formatDuration } from '@/utils/time'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  renderState: RenderState
  errorCount: number
  warningCount: number
  duration: number
  backendName: string
  outputWidth: number
  outputHeight: number
}>()

const isBusy = computed(() => ['initializing', 'validating', 'rendering', 'exporting'].includes(props.renderState))
const stateLabel = computed(() => {
  if (props.renderState === 'initializing') return 'Initializing engine'
  if (props.renderState === 'validating') return 'Validating input'
  if (props.renderState === 'rendering') return 'Rendering scene'
  if (props.renderState === 'exporting') return 'Encoding output'
  if (props.errorCount) return `${props.errorCount} ${props.errorCount === 1 ? 'error' : 'errors'}`
  return 'Scene valid'
})
</script>

<template>
  <footer class="status-bar">
    <div class="status-group">
      <span class="status-primary" :class="{ error: props.errorCount, busy: isBusy }">
        <UiIcon
          :name="isBusy ? 'spinner' : props.errorCount ? 'alert' : 'check'"
          :class="{ spinning: isBusy }"
          :size="13"
        />
        {{ stateLabel }}
      </span>
      <span v-if="props.warningCount" class="status-item warning">
        <UiIcon name="info" :size="13" />
        {{ props.warningCount }} {{ props.warningCount === 1 ? 'warning' : 'warnings' }}
      </span>
      <span v-if="props.duration" class="status-item desktop-status">Rendered in {{ formatDuration(props.duration) }}</span>
    </div>
    <div class="status-group status-right">
      <span class="status-item desktop-status">{{ props.backendName }}</span>
      <span class="status-divider desktop-status" />
      <span class="status-item">{{ props.outputWidth.toLocaleString() }} × {{ props.outputHeight.toLocaleString() }} px</span>
    </div>
  </footer>
</template>
