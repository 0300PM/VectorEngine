<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RenderState } from '@/types/engine'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  svg: string | null
  width: number
  height: number
  objectCount: number
  renderState: RenderState
  stale: boolean
}>()

const stage = ref<HTMLDivElement | null>(null)
const stageWidth = ref(800)
const stageHeight = ref(600)
const zoom = ref(1)
const imageUrl = ref<string | null>(null)
let resizeObserver: ResizeObserver | null = null

const fitScale = computed(() => {
  if (!props.width || !props.height) {
    return 1
  }
  const horizontal = Math.max(120, stageWidth.value - 112) / props.width
  const vertical = Math.max(120, stageHeight.value - 112) / props.height
  return Math.min(horizontal, vertical, 1)
})

const displayScale = computed(() => fitScale.value * zoom.value)
const displayWidth = computed(() => Math.max(1, props.width * displayScale.value))
const displayHeight = computed(() => Math.max(1, props.height * displayScale.value))
const zoomLabel = computed(() => `${Math.round(displayScale.value * 100)}%`)
const busy = computed(() => ['initializing', 'validating', 'rendering'].includes(props.renderState))

const setZoom = (value: number): void => {
  zoom.value = Math.min(6, Math.max(0.2, value))
}

const zoomIn = (): void => setZoom(zoom.value * 1.2)
const zoomOut = (): void => setZoom(zoom.value / 1.2)
const fit = (): void => setZoom(1)
const actualSize = (): void => setZoom(1 / fitScale.value)

const handleWheel = (event: WheelEvent): void => {
  if (!event.ctrlKey && !event.metaKey) {
    return
  }
  event.preventDefault()
  setZoom(zoom.value * (event.deltaY > 0 ? 0.9 : 1.1))
}

watch(() => props.svg, (svg) => {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
  }
  if (svg) {
    imageUrl.value = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  }
}, { immediate: true })

onMounted(() => {
  if (!stage.value) {
    return
  }
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) {
      stageWidth.value = entry.contentRect.width
      stageHeight.value = entry.contentRect.height
    }
  })
  resizeObserver.observe(stage.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
  }
})
</script>

<template>
  <section class="workspace-panel preview-panel" aria-label="Rendered preview">
    <header class="panel-heading preview-heading">
      <div>
        <div class="panel-eyebrow">CANVAS</div>
        <h2 class="panel-title">Preview</h2>
      </div>
      <div class="preview-meta">
        <span>{{ props.width.toLocaleString() }} × {{ props.height.toLocaleString() }} px</span>
        <span class="meta-separator" />
        <span>{{ props.objectCount }} {{ props.objectCount === 1 ? 'object' : 'objects' }}</span>
      </div>
    </header>

    <div ref="stage" class="preview-stage" @wheel="handleWheel">
      <div v-if="busy" class="render-badge">
        <UiIcon name="spinner" class="spinning" :size="14" />
        <span>{{ props.renderState === 'initializing' ? 'Starting engine' : 'Updating preview' }}</span>
      </div>
      <div v-if="props.stale && imageUrl" class="stale-badge">
        Last valid render
      </div>

      <div v-if="imageUrl" class="canvas-centering">
        <div
          class="canvas-artboard"
          :style="{ width: `${displayWidth}px`, height: `${displayHeight}px` }"
        >
          <img :src="imageUrl" alt="Rendered vector scene" draggable="false" />
        </div>
      </div>

      <div v-else class="empty-preview">
        <div class="empty-preview-icon">
          <UiIcon name="preview" :size="24" />
        </div>
        <strong>No preview available</strong>
        <span>Fix the JSON errors to render this scene.</span>
      </div>
    </div>

    <div class="preview-controls" aria-label="Zoom controls">
      <button type="button" title="Zoom out" aria-label="Zoom out" @click="zoomOut">
        <UiIcon name="minus" :size="14" />
      </button>
      <button class="zoom-value" type="button" title="Show at actual size" @click="actualSize">
        {{ zoomLabel }}
      </button>
      <button type="button" title="Zoom in" aria-label="Zoom in" @click="zoomIn">
        <UiIcon name="plus" :size="14" />
      </button>
      <span class="control-divider" />
      <button class="fit-button" type="button" title="Fit to view" @click="fit">
        <UiIcon name="fit" :size="14" />
        Fit
      </button>
    </div>
  </section>
</template>
