<script setup lang="ts">
import { computed } from 'vue'
import type { EditorBackdrop } from '@/export/types'
import type { PathCommand } from '@/paths/editor'
import type { PathModel } from '@/paths/model'
import type { PathToolKind } from '@/paths/tools'
import type { RenderState } from '@/types/engine'
import { useEngineStore } from '@/stores/engine'
import { zoomLabel } from '@/canvas/view'
import CanvasControls from './CanvasControls.vue'
import CanvasStage from './CanvasStage.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  svg: string | null
  width: number
  height: number
  objectCount: number
  renderState: RenderState
  stale: boolean
  backdrop: EditorBackdrop
  pathModel: PathModel | null
  pathTool: PathToolKind
  nodeEditing: boolean
}>()

const emit = defineEmits<{
  'update:backdrop': [value: EditorBackdrop]
  'path-command': [command: PathCommand]
  'path-create': [model: PathModel, name: string]
  'path-select': [subpath: number, node: number]
  'path-cancel': []
}>()

const store = useEngineStore()

const backdrops: { value: EditorBackdrop; label: string }[] = [
  { value: 'checker', label: 'Grid' },
  { value: 'light', label: 'Light' },
  { value: 'white', label: 'White' },
  { value: 'dark', label: 'Dark' },
]

const center = computed(() => ({ x: store.viewport.width / 2, y: store.viewport.height / 2 }))
const label = computed(() => zoomLabel(store.view))
const cursorLabel = computed(() => {
  const point = store.cursorDocumentPoint
  return point ? `${Math.round(point.x * 100) / 100}, ${Math.round(point.y * 100) / 100}` : '—'
})

const zoomIn = (): void => store.zoomInAt(center.value)
const zoomOut = (): void => store.zoomOutAt(center.value)

const handlePathCommand = (command: PathCommand): void => emit('path-command', command)
const handlePathCreate = (model: PathModel, name: string): void => emit('path-create', model, name)
const handlePathSelect = (subpath: number, node: number): void => emit('path-select', subpath, node)
const handlePathCancel = (): void => emit('path-cancel')
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

    <div class="canvas-toolbar-slot">
      <CanvasControls />
    </div>

    <CanvasStage
      :svg="props.svg"
      :width="props.width"
      :height="props.height"
      :object-count="props.objectCount"
      :render-state="props.renderState"
      :stale="props.stale"
      :backdrop="props.backdrop"
      :path-model="props.pathModel"
      :path-tool="props.pathTool"
      :node-editing="props.nodeEditing"
      @update:backdrop="emit('update:backdrop', $event)"
      @path-command="handlePathCommand"
      @path-create="handlePathCreate"
      @path-select="handlePathSelect"
      @path-cancel="handlePathCancel"
    />

    <div class="preview-controls" aria-label="Canvas and zoom controls">
      <div class="backdrop-pills" role="group" aria-label="Editor preview background">
        <button
          v-for="item in backdrops"
          :key="item.value"
          type="button"
          :class="{ active: props.backdrop === item.value }"
          :aria-pressed="props.backdrop === item.value"
          @click="emit('update:backdrop', item.value)"
        >
          {{ item.label }}
        </button>
      </div>
      <span class="control-divider" />
      <button type="button" title="Zoom in" aria-label="Zoom in" @click="zoomIn">
        <UiIcon name="plus" :size="14" />
      </button>
      <button class="zoom-value" type="button" title="Zoom to 100%" @click="store.showActualSize()">
        {{ label }}
      </button>
      <button type="button" title="Zoom out" aria-label="Zoom out" @click="zoomOut">
        <UiIcon name="minus" :size="14" />
      </button>
      <span class="control-divider" />
      <button class="fit-button" type="button" title="Fit to canvas" @click="store.fitToScreen()">
        <UiIcon name="fit" :size="14" />
        Fit
      </button>
      <button class="fit-button" type="button" title="Fit to selection" @click="store.fitToSelection()">
        Selection
      </button>
      <span class="control-divider" />
      <span class="cursor-readout" :title="'Document coordinates under the cursor'">{{ cursorLabel }}</span>
    </div>
  </section>
</template>
