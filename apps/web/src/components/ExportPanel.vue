<script setup lang="ts">
import type { BackgroundMode, ExportFormat, ExportSettings } from '@/types/engine'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  settings: ExportSettings
  outputWidth: number
  outputHeight: number
  outputValid: boolean
  documentBackground: string | null
  canExport: boolean
  exporting: boolean
}>()

const emit = defineEmits<{
  setFormat: [format: ExportFormat]
  setWidth: [width: number]
  setHeight: [height: number]
  setScale: [scale: number]
  setLock: [locked: boolean]
  setBackgroundMode: [mode: BackgroundMode]
  setBackground: [color: string]
  setQuality: [quality: number]
  resetDimensions: []
  export: []
}>()

const formats: { id: ExportFormat; label: string; description: string }[] = [
  { id: 'svg', label: 'SVG', description: 'Vector' },
  { id: 'png', label: 'PNG', description: 'Lossless' },
  { id: 'jpeg', label: 'JPG', description: 'Compact' },
  { id: 'bmp', label: 'BMP', description: '24-bit' },
]

const scales = [0.5, 1, 2, 3]

const numberFromEvent = (event: Event, fallback: number): number => {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : fallback
}
</script>

<template>
  <aside class="workspace-panel export-panel" aria-label="Export settings">
    <header class="panel-heading">
      <div>
        <div class="panel-eyebrow">OUTPUT</div>
        <h2 class="panel-title">Export</h2>
      </div>
      <span class="config-badge">{{ props.settings.format.toUpperCase() }}</span>
    </header>

    <div class="inspector-scroll">
      <section class="inspector-section">
        <div class="section-heading">
          <label>Format</label>
        </div>
        <div class="format-grid">
          <button
            v-for="format in formats"
            :key="format.id"
            class="format-option"
            :class="{ selected: props.settings.format === format.id }"
            type="button"
            @click="emit('setFormat', format.id)"
          >
            <span class="format-label">{{ format.label }}</span>
            <span class="format-description">{{ format.description }}</span>
            <span v-if="props.settings.format === format.id" class="format-check">
              <UiIcon name="check" :size="11" />
            </span>
          </button>
        </div>
      </section>

      <section class="inspector-section">
        <div class="section-heading">
          <label>Dimensions</label>
          <button type="button" @click="emit('resetDimensions')">Reset</button>
        </div>
        <div class="dimension-row">
          <label class="field-group">
            <span>W</span>
            <input
              type="number"
              min="1"
              max="16384"
              :value="props.settings.width"
              aria-label="Export width"
              @change="emit('setWidth', numberFromEvent($event, props.settings.width))"
            />
            <em>px</em>
          </label>
          <button
            class="lock-button"
            type="button"
            :title="props.settings.lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'"
            :aria-label="props.settings.lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'"
            @click="emit('setLock', !props.settings.lockAspect)"
          >
            <UiIcon :name="props.settings.lockAspect ? 'lock' : 'unlock'" :size="14" />
          </button>
          <label class="field-group">
            <span>H</span>
            <input
              type="number"
              min="1"
              max="16384"
              :value="props.settings.height"
              aria-label="Export height"
              @change="emit('setHeight', numberFromEvent($event, props.settings.height))"
            />
            <em>px</em>
          </label>
        </div>

        <div class="sub-label">Scale</div>
        <div class="scale-control">
          <button
            v-for="scale in scales"
            :key="scale"
            type="button"
            :class="{ selected: props.settings.scale === scale }"
            @click="emit('setScale', scale)"
          >
            {{ scale }}×
          </button>
        </div>
        <div class="output-size-note" :class="{ error: !props.outputValid }">
          <template v-if="props.outputValid">
            Output: <strong>{{ props.outputWidth.toLocaleString() }} × {{ props.outputHeight.toLocaleString() }} px</strong>
          </template>
          <template v-else>Output exceeds the 67.1 MP resource limit</template>
        </div>
      </section>

      <section class="inspector-section">
        <div class="section-heading">
          <label>Background</label>
        </div>
        <div class="background-options">
          <label class="radio-option">
            <input
              type="radio"
              name="background"
              value="document"
              :checked="props.settings.backgroundMode === 'document'"
              @change="emit('setBackgroundMode', 'document')"
            />
            <span class="radio-control" />
            <span class="radio-copy">
              <strong>Document</strong>
              <small>{{ props.documentBackground ?? 'Transparent' }}</small>
            </span>
            <span
              class="color-swatch"
              :class="{ checker: !props.documentBackground }"
              :style="props.documentBackground ? { background: props.documentBackground } : {}"
            />
          </label>
          <label class="radio-option" :class="{ disabled: props.settings.format === 'jpeg' }">
            <input
              type="radio"
              name="background"
              value="transparent"
              :checked="props.settings.backgroundMode === 'transparent'"
              :disabled="props.settings.format === 'jpeg'"
              @change="emit('setBackgroundMode', 'transparent')"
            />
            <span class="radio-control" />
            <span class="radio-copy">
              <strong>Transparent</strong>
              <small>{{ props.settings.format === 'jpeg' ? 'Unavailable for JPG' : 'Preserve alpha' }}</small>
            </span>
            <span class="color-swatch checker" />
          </label>
          <label class="radio-option">
            <input
              type="radio"
              name="background"
              value="custom"
              :checked="props.settings.backgroundMode === 'custom'"
              @change="emit('setBackgroundMode', 'custom')"
            />
            <span class="radio-control" />
            <span class="radio-copy">
              <strong>Custom</strong>
              <small>{{ props.settings.background }}</small>
            </span>
            <input
              class="color-picker"
              type="color"
              :value="props.settings.background"
              aria-label="Custom background color"
              @input="emit('setBackground', ($event.target as HTMLInputElement).value.toUpperCase())"
            />
          </label>
        </div>
      </section>

      <section v-if="props.settings.format === 'jpeg'" class="inspector-section">
        <div class="section-heading quality-heading">
          <label for="quality">Quality</label>
          <strong>{{ props.settings.quality }}</strong>
        </div>
        <input
          id="quality"
          class="range-input"
          type="range"
          min="1"
          max="100"
          :value="props.settings.quality"
          @input="emit('setQuality', numberFromEvent($event, props.settings.quality))"
        />
        <div class="range-labels"><span>Smaller file</span><span>Higher quality</span></div>
      </section>
    </div>

    <footer class="export-footer">
      <button
        class="button button-primary export-button"
        type="button"
        :disabled="!props.canExport || props.exporting"
        @click="emit('export')"
      >
        <UiIcon :name="props.exporting ? 'spinner' : 'download'" :class="{ spinning: props.exporting }" />
        {{ props.exporting ? 'Preparing file' : `Export ${props.settings.format.toUpperCase()}` }}
      </button>
      <span>Generated locally in your browser</span>
    </footer>
  </aside>
</template>
