<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { formatByteSize } from '@/export'
import type {
  ExportFormat,
  ExportScalePreset,
  ExportTargetKind,
  FitMode,
} from '@/export/types'
import { useEngineStore } from '@/stores/engine'
import InspectorSection from './InspectorSection.vue'
import UiIcon from './UiIcon.vue'

const store = useEngineStore()
const emit = defineEmits<{
  export: []
  exportBatch: []
  collapse: []
}>()

const expandedOverrideId = ref<string | null>(null)
const exportThumbUrl = ref('')

const targetKinds: { value: ExportTargetKind; label: string }[] = [
  { value: 'scene', label: 'Scene' },
  { value: 'selection', label: 'Selection' },
  { value: 'group', label: 'Group' },
  { value: 'layer', label: 'Layer' },
  { value: 'objects', label: 'Object' },
  { value: 'workspace', label: 'Workspace' },
]

const formats: { id: ExportFormat; label: string; description: string }[] = [
  { id: 'svg', label: 'SVG', description: 'Vector' },
  { id: 'png', label: 'PNG', description: 'Lossless' },
  { id: 'jpeg', label: 'JPEG', description: 'Compact' },
  { id: 'bmp', label: 'BMP', description: '24/32-bit' },
]

const scalePresets: ExportScalePreset[] = [0.5, 1, 2, 3, 4]

const fitModes: { value: FitMode; label: string }[] = [
  { value: 'contain', label: 'Contain' },
  { value: 'cover', label: 'Cover' },
  { value: 'stretch', label: 'Stretch' },
]

watch(
  () => store.exportPreview?.svg ?? '',
  (svg, _, onCleanup) => {
    if (!svg) {
      exportThumbUrl.value = ''
      return
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    exportThumbUrl.value = url
    onCleanup(() => URL.revokeObjectURL(url))
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (exportThumbUrl.value) {
    URL.revokeObjectURL(exportThumbUrl.value)
  }
})

const documentBackground = computed(() => {
  const value = store.scene?.document.background
  return value && value !== 'none' ? value : null
})

const progressPercent = computed(() => {
  if (store.batchProgressTotal <= 0) {
    return 0
  }
  return Math.round((store.batchProgressCompleted / store.batchProgressTotal) * 100)
})

const sizeSummaryLabel = computed(() => {
  if (store.lastExportResult) {
    return `${formatByteSize(store.lastExportResult.sizeBytes)} (${store.lastExportResult.sizeBytes.toLocaleString()} B)`
  }
  const est = store.exportPreview?.estimate
  if (!est) {
    return '—'
  }
  return est.exactSizeKnown
    ? formatByteSize(est.estimatedBytes)
    : `~${formatByteSize(est.estimatedBytes)}`
})

const memorySummaryLabel = computed(() => {
  const est = store.exportPreview?.estimate
  if (!est) {
    return '0 B'
  }
  return est.workingMemoryBytes === 0 ? 'Vector (0 B)' : formatByteSize(est.workingMemoryBytes)
})

const alphaSummaryLabel = computed(() => {
  const hasAlpha = store.lastExportResult
    ? store.lastExportResult.hasAlpha
    : store.exportPreview?.estimate.hasAlpha ?? false
  return hasAlpha ? 'RGBA Alpha' : 'Opaque RGB'
})

const combinedWarnings = computed(() => {
  const set = new Set<string>(store.preflightValidation.warnings)
  for (const warning of store.exportPreview?.estimate.warnings ?? []) {
    set.add(warning)
  }
  for (const warning of store.lastExportResult?.warnings ?? []) {
    set.add(warning)
  }
  return [...set]
})

const primaryActionLabel = computed(() => {
  if (store.exporting) {
    return store.batchMode
      ? `Exporting ${store.batchProgressCompleted}/${store.batchProgressTotal}`
      : 'Preparing file'
  }
  if (store.batchMode) {
    const count = store.batchSelectedIds.length
    return store.packageAsZip ? `Export ZIP (${count})` : `Export Batch (${count})`
  }
  return `Export ${store.exportFormat.toUpperCase()}`
})

const handlePrimaryAction = (): void => {
  if (store.batchMode) {
    emit('exportBatch')
  } else {
    emit('export')
  }
}

const numberFromEvent = (event: Event, fallback: number): number => {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : fallback
}

const selectAllObjects = (): void => {
  store.selectedObjectIds = store.sceneCatalog.objects.map((entry) => entry.id)
}

const selectAllBatchCandidates = (): void => {
  store.batchSelectedIds = store.batchCandidatePool.map((candidate) => candidate.id)
}

const toggleOverrideRow = (id: string): void => {
  expandedOverrideId.value = expandedOverrideId.value === id ? null : id
}
</script>

<template>
  <aside class="workspace-panel export-panel" aria-label="Export settings">
    <header class="panel-heading">
      <div>
        <div class="panel-eyebrow">OUTPUT</div>
        <h2 class="panel-title">Export</h2>
      </div>
      <div class="panel-heading-actions">
        <button
          type="button"
          class="panel-collapse"
          title="Collapse panel"
          aria-label="Collapse Export panel"
          @click="emit('collapse')"
        >
          <UiIcon name="chevron" :size="13" />
        </button>
        <div class="mode-toggle" role="group" aria-label="Export pipeline mode">
          <button
            type="button"
            :class="{ selected: !store.batchMode }"
            :aria-pressed="!store.batchMode"
            @click="store.batchMode = false"
          >
            Single
          </button>
          <button
            type="button"
            :class="{ selected: store.batchMode }"
            :aria-pressed="store.batchMode"
            @click="store.batchMode = true"
          >
            Batch
          </button>
        </div>
      </div>
    </header>

    <div class="inspector-scroll">
      <InspectorSection id="sec-1-target" title="1. Target" storage-key="export.target">
        <template #heading-extra>
          <span class="config-badge">{{ store.batchMode ? `${store.batchSelectedIds.length} items` : store.targetKind }}</span>
        </template>

        <template v-if="!store.batchMode">
          <div class="scope-grid" role="group" aria-label="Export target scope">
            <button
              v-for="kind in targetKinds"
              :key="kind.value"
              type="button"
              :class="{ selected: store.targetKind === kind.value }"
              :aria-pressed="store.targetKind === kind.value"
              @click="store.targetKind = kind.value"
            >
              {{ kind.label }}
            </button>
          </div>

          <div v-if="store.targetKind === 'selection'" class="nested-card">
            <div class="nested-row-head">
              <span>Selected ({{ store.selectedObjectIds.length }})</span>
              <button type="button" class="inline-btn" @click="selectAllObjects">Select all</button>
            </div>
            <div class="compact-checklist" role="group" aria-label="Selected scene objects">
              <label v-for="item in store.sceneCatalog.objects" :key="item.id" class="compact-check">
                <input
                  type="checkbox"
                  :checked="store.selectedObjectIds.includes(item.id)"
                  @change="store.toggleObjectInSelection(item.id)"
                />
                <span class="truncate-text">{{ item.label }}</span>
                <em>{{ item.type }}</em>
              </label>
            </div>
          </div>

          <label v-else-if="store.targetKind === 'group'" class="stack-field">
            <span>Group</span>
            <select v-model="store.selectedGroupId" class="inspector-select">
              <option v-for="group in store.sceneCatalog.groups" :key="group.id" :value="group.id">
                {{ group.label }} ({{ group.id }})
              </option>
            </select>
          </label>

          <label v-else-if="store.targetKind === 'layer'" class="stack-field">
            <span>Layer</span>
            <select v-model="store.selectedLayerId" class="inspector-select">
              <option v-for="layer in store.sceneCatalog.layers" :key="layer.id" :value="layer.id">
                {{ layer.label }} ({{ layer.id }})
              </option>
            </select>
          </label>

          <label v-else-if="store.targetKind === 'objects'" class="stack-field">
            <span>Object</span>
            <select v-model="store.selectedSingleObjectId" class="inspector-select">
              <option v-for="obj in store.sceneCatalog.objects" :key="obj.id" :value="obj.id">
                {{ obj.label }} ({{ obj.type }})
              </option>
            </select>
          </label>

          <div v-else-if="store.targetKind === 'workspace'" class="nested-card">
            <label class="toggle-line">
              <input v-model="store.useCustomWorkspaceRegion" type="checkbox" />
              <span>Custom crop area</span>
            </label>

            <label v-if="!store.useCustomWorkspaceRegion" class="stack-field">
              <span>Workspace preset</span>
              <select v-model="store.selectedWorkspaceId" class="inspector-select">
                <option v-for="ws in store.sceneCatalog.workspaces" :key="ws.id" :value="ws.id">
                  {{ ws.name ?? ws.id }} ({{ ws.width }}×{{ ws.height }})
                </option>
              </select>
            </label>

            <div v-else class="quad-grid">
              <label class="field-group">
                <span>X</span>
                <input v-model.number="store.customRegion.x" type="number" aria-label="Workspace X" />
                <em>px</em>
              </label>
              <label class="field-group">
                <span>Y</span>
                <input v-model.number="store.customRegion.y" type="number" aria-label="Workspace Y" />
                <em>px</em>
              </label>
              <label class="field-group">
                <span>W</span>
                <input v-model.number="store.customRegion.width" type="number" min="1" aria-label="Workspace width" />
                <em>px</em>
              </label>
              <label class="field-group">
                <span>H</span>
                <input v-model.number="store.customRegion.height" type="number" min="1" aria-label="Workspace height" />
                <em>px</em>
              </label>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="scale-control cols-3" role="group" aria-label="Batch source collection">
            <button
              type="button"
              :class="{ selected: store.batchScopeKind === 'objects' }"
              @click="store.batchScopeKind = 'objects'"
            >
              Objects
            </button>
            <button
              type="button"
              :class="{ selected: store.batchScopeKind === 'groups' }"
              @click="store.batchScopeKind = 'groups'"
            >
              Groups
            </button>
            <button
              type="button"
              :class="{ selected: store.batchScopeKind === 'layers' }"
              @click="store.batchScopeKind = 'layers'"
            >
              Layers
            </button>
          </div>

          <div class="nested-card">
            <div class="nested-row-head">
              <span>Queue ({{ store.batchSelectedIds.length }}/{{ store.batchCandidatePool.length }})</span>
              <div class="inline-btn-group">
                <button type="button" class="inline-btn" @click="selectAllBatchCandidates">All</button>
                <button type="button" class="inline-btn" @click="store.batchSelectedIds = []">None</button>
              </div>
            </div>

            <div class="compact-checklist">
              <div v-for="item in store.batchCandidatePool" :key="item.id" class="batch-item-entry">
                <div class="batch-item-row">
                  <label class="compact-check">
                    <input
                      type="checkbox"
                      :checked="store.batchSelectedIds.includes(item.id)"
                      @change="store.toggleBatchCandidate(item.id)"
                    />
                    <span class="truncate-text">{{ item.label }}</span>
                  </label>
                  <button
                    type="button"
                    class="mini-chip"
                    :aria-expanded="expandedOverrideId === item.id"
                    @click="toggleOverrideRow(item.id)"
                  >
                    {{ store.batchOverrides[item.id]?.enabled ? 'Custom' : 'Override' }}
                  </button>
                </div>

                <div v-if="expandedOverrideId === item.id" class="override-box">
                  <label class="toggle-line">
                    <input
                      type="checkbox"
                      :checked="Boolean(store.batchOverrides[item.id]?.enabled)"
                      @change="store.setBatchOverride(item.id, { enabled: ($event.target as HTMLInputElement).checked })"
                    />
                    <span>Custom item overrides</span>
                  </label>
                  <div v-if="store.batchOverrides[item.id]?.enabled" class="override-selects">
                    <select
                      class="inspector-select compact"
                      aria-label="Item format override"
                      :value="store.batchOverrides[item.id]?.format ?? ''"
                      @change="store.setBatchOverride(item.id, { format: (($event.target as HTMLSelectElement).value || undefined) as ExportFormat | undefined })"
                    >
                      <option value="">Shared format</option>
                      <option value="svg">SVG</option>
                      <option value="png">PNG</option>
                      <option value="jpeg">JPEG</option>
                      <option value="bmp">BMP</option>
                    </select>
                    <select
                      class="inspector-select compact"
                      aria-label="Item scale override"
                      :value="store.batchOverrides[item.id]?.scale ?? ''"
                      @change="store.setBatchOverride(item.id, { scale: (($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : undefined) as ExportScalePreset | undefined })"
                    >
                      <option value="">Shared scale</option>
                      <option v-for="sc in scalePresets" :key="sc" :value="sc">{{ sc }}×</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </InspectorSection>

      <InspectorSection id="sec-2-format" title="2. Format" storage-key="export.format">
        <template #heading-extra>
          <span class="config-badge">{{ store.exportFormat.toUpperCase() }}</span>
        </template>
        <div class="format-grid">
          <button
            v-for="format in formats"
            :key="format.id"
            class="format-option"
            :class="{ selected: store.exportFormat === format.id }"
            type="button"
            :aria-pressed="store.exportFormat === format.id"
            @click="store.setFormat(format.id)"
          >
            <span class="format-label">{{ format.label }}</span>
            <span class="format-description">{{ format.description }}</span>
            <span v-if="store.exportFormat === format.id" class="format-check">
              <UiIcon name="check" :size="11" />
            </span>
          </button>
        </div>
      </InspectorSection>

      <InspectorSection id="sec-3-dimensions" title="3. Dimensions" storage-key="export.dimensions">
        <template #heading-extra>
          <button type="button" class="inline-btn" @click="store.resetDimensions()">Reset</button>
        </template>

        <div class="dimension-row">
          <label class="field-group">
            <span>W</span>
            <input
              type="number"
              min="1"
              max="16384"
              :value="store.effectiveDimensions.width"
              aria-label="Export width"
              @input="store.setCustomWidth(numberFromEvent($event, store.effectiveDimensions.width))"
            />
            <em>px</em>
          </label>
          <button
            class="lock-button"
            type="button"
            :aria-pressed="store.lockAspectRatio"
            :title="store.lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'"
            :aria-label="store.lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'"
            @click="store.lockAspectRatio = !store.lockAspectRatio"
          >
            <UiIcon :name="store.lockAspectRatio ? 'lock' : 'unlock'" :size="14" />
          </button>
          <label class="field-group">
            <span>H</span>
            <input
              type="number"
              min="1"
              max="16384"
              :value="store.effectiveDimensions.height"
              aria-label="Export height"
              @input="store.setCustomHeight(numberFromEvent($event, store.effectiveDimensions.height))"
            />
            <em>px</em>
          </label>
        </div>

        <div class="sub-label">Scale</div>
        <div class="scale-control cols-6" role="group" aria-label="Scale preset">
          <button
            v-for="scale in scalePresets"
            :key="scale"
            type="button"
            :class="{ selected: store.scaleMode === 'preset' && store.exportScale === scale }"
            :aria-pressed="store.scaleMode === 'preset' && store.exportScale === scale"
            @click="store.setPresetScale(scale)"
          >
            {{ scale }}×
          </button>
          <button
            type="button"
            :class="{ selected: store.scaleMode === 'custom' }"
            :aria-pressed="store.scaleMode === 'custom'"
            @click="store.enableCustomScale()"
          >
            Custom
          </button>
        </div>

        <div class="sub-label">Fit mode</div>
        <div class="scale-control cols-3" role="group" aria-label="Aspect ratio fit mode">
          <button
            v-for="fit in fitModes"
            :key="fit.value"
            type="button"
            :class="{ selected: store.fitMode === fit.value }"
            :aria-pressed="store.fitMode === fit.value"
            @click="store.fitMode = fit.value"
          >
            {{ fit.label }}
          </button>
        </div>
      </InspectorSection>

      <InspectorSection id="sec-4-background" title="4. Background" storage-key="export.background">
        <div class="background-options">
          <label class="radio-option">
            <input
              type="radio"
              name="background"
              value="document"
              :checked="store.backgroundMode === 'document'"
              @change="store.backgroundMode = 'document'"
            />
            <span class="radio-control" />
            <span class="radio-copy">
              <strong>Document</strong>
              <small>{{ documentBackground ?? 'Transparent' }}</small>
            </span>
            <span
              class="color-swatch"
              :class="{ checker: !documentBackground }"
              :style="documentBackground ? { background: documentBackground } : {}"
            />
          </label>
          <label class="radio-option">
            <input
              type="radio"
              name="background"
              value="transparent"
              :checked="store.backgroundMode === 'transparent'"
              @change="store.backgroundMode = 'transparent'"
            />
            <span class="radio-control" />
            <span class="radio-copy">
              <strong>Transparent</strong>
              <small>{{ store.exportFormat === 'jpeg' ? 'Flattened to white on JPEG' : 'Preserve alpha channel' }}</small>
            </span>
            <span class="color-swatch checker" />
          </label>
          <label class="radio-option">
            <input
              type="radio"
              name="background"
              value="custom"
              :checked="store.backgroundMode === 'custom'"
              @change="store.backgroundMode = 'custom'"
            />
            <span class="radio-control" />
            <span class="radio-copy">
              <strong>Custom</strong>
              <small>{{ store.customBackgroundColor }}</small>
            </span>
            <input
              class="color-picker"
              type="color"
              :value="/^#[0-9a-fA-F]{6}$/.test(store.customBackgroundColor) ? store.customBackgroundColor : '#ffffff'"
              aria-label="Custom background color"
              @input="store.customBackgroundColor = ($event.target as HTMLInputElement).value.toUpperCase(); store.backgroundMode = 'custom'"
            />
          </label>
        </div>
        <input
          v-if="store.backgroundMode === 'custom'"
          v-model="store.customBackgroundColor"
          type="text"
          class="inspector-text-input mono"
          aria-label="Custom background HEX value"
          placeholder="#FFFFFF"
        />
      </InspectorSection>

      <InspectorSection id="sec-5-advanced" title="5. Advanced" storage-key="export.advanced">

        <div v-if="store.exportFormat === 'jpeg'" class="adv-block">
          <div class="section-heading quality-heading tight">
            <label for="quality">Quality</label>
            <strong>{{ store.jpegQuality }}%</strong>
          </div>
          <input
            id="quality"
            class="range-input"
            type="range"
            min="1"
            max="100"
            :value="store.jpegQuality"
            @input="store.jpegQuality = Math.min(100, Math.max(1, Math.round(numberFromEvent($event, store.jpegQuality))))"
          />
        </div>

        <div v-if="store.exportFormat === 'bmp'" class="adv-block">
          <div class="sub-label first">BMP Variant</div>
          <div class="scale-control cols-2" role="group" aria-label="BMP bit depth">
            <button
              type="button"
              :class="{ selected: store.bmpBitDepth === 24 }"
              @click="store.bmpBitDepth = 24"
            >
              24-bit BGR
            </button>
            <button
              type="button"
              :class="{ selected: store.bmpBitDepth === 32 }"
              @click="store.bmpBitDepth = 32"
            >
              32-bit BGRA
            </button>
          </div>
        </div>

        <div class="adv-block">
          <label class="field-group full">
            <span>Margin</span>
            <input
              v-model.number="store.margin"
              type="number"
              min="0"
              max="4096"
              aria-label="Export margin in pixels"
            />
            <em>px</em>
          </label>
        </div>

        <div class="toggle-stack">
          <label v-if="store.exportFormat === 'svg'" class="toggle-line">
            <input v-model="store.minifySvg" type="checkbox" />
            <span>Minify SVG code</span>
          </label>
          <label class="toggle-line">
            <input v-model="store.trimToBounds" type="checkbox" />
            <span>Trim to tight content bounds</span>
          </label>
          <label class="toggle-line">
            <input v-model="store.clipToBounds" type="checkbox" />
            <span>Clip geometry to export bounds</span>
          </label>
          <label class="toggle-line">
            <input v-model="store.includeHidden" type="checkbox" />
            <span>Include hidden objects &amp; layers</span>
          </label>
          <label v-if="store.batchMode" class="toggle-line">
            <input v-model="store.packageAsZip" type="checkbox" />
            <span>Package files into ZIP archive</span>
          </label>
        </div>

        <label class="stack-field top-gap">
          <span class="split-row">
            <span>Filename template</span>
            <em class="mono">{{ store.resolvedFilenamePreview }}</em>
          </span>
          <input
            v-if="!store.batchMode"
            v-model="store.filenameTemplate"
            type="text"
            class="inspector-text-input mono"
            aria-label="Filename template"
            placeholder="{document}"
          />
          <input
            v-else
            v-model="store.batchFilenameTemplate"
            type="text"
            class="inspector-text-input mono"
            aria-label="Batch filename template"
            placeholder="{document}_{object}_{scale}"
          />
        </label>
      </InspectorSection>

      <InspectorSection id="sec-6-preview" title="6. Preview" storage-key="export.preview">
        <template #heading-extra>
          <span v-if="store.exportPreview?.downscaled" class="config-badge">
            Thumb {{ store.exportPreview.previewWidth }}×{{ store.exportPreview.previewHeight }}
          </span>
        </template>

        <div class="export-thumb-frame checker">
          <img
            v-if="exportThumbUrl"
            :src="exportThumbUrl"
            alt="Export preview thumbnail"
            class="export-thumb-image"
          />
          <span v-else class="thumb-placeholder">Preview unavailable</span>
        </div>

        <dl class="metrics-table">
          <div>
            <dt>Output</dt>
            <dd>{{ store.outputWidth.toLocaleString() }} × {{ store.outputHeight.toLocaleString() }} px</dd>
          </div>
          <div>
            <dt>{{ store.lastExportResult ? 'Exact size' : 'Estimated size' }}</dt>
            <dd>{{ sizeSummaryLabel }}</dd>
          </div>
          <div>
            <dt>Memory</dt>
            <dd>{{ memorySummaryLabel }}</dd>
          </div>
          <div>
            <dt>Alpha</dt>
            <dd>{{ alphaSummaryLabel }}</dd>
          </div>
        </dl>

        <ul v-if="!store.preflightValidation.ok" class="inspector-alerts error" role="alert">
          <li v-for="err in store.preflightValidation.errors" :key="err.code + err.message">
            {{ err.message }}
          </li>
        </ul>

        <ul v-if="combinedWarnings.length > 0" class="inspector-alerts warning" aria-live="polite">
          <li v-for="warn in combinedWarnings" :key="warn">
            {{ warn }}
          </li>
        </ul>
      </InspectorSection>
    </div>

    <footer class="export-footer" aria-labelledby="sec-7-export">
      <div class="section-heading footer-heading">
        <label id="sec-7-export">7. Export</label>
        <span v-if="store.exportMessage" class="footer-note">{{ store.exportMessage }}</span>
      </div>

      <div class="footer-action-row">
        <button
          class="button button-primary export-button"
          type="button"
          :disabled="!store.canExport || store.exporting"
          @click="handlePrimaryAction"
        >
          <UiIcon :name="store.exporting ? 'spinner' : 'download'" :class="{ spinning: store.exporting }" />
          {{ primaryActionLabel }}
        </button>

        <button
          v-if="store.exporting"
          type="button"
          class="button button-cancel"
          aria-label="Cancel export"
          @click="store.cancelActiveExport()"
        >
          <UiIcon name="close" :size="14" />
          Cancel
        </button>
      </div>

      <div v-if="store.exporting && store.batchMode && store.batchProgressTotal > 0" class="batch-progress-block">
        <div
          class="progress-track"
          role="progressbar"
          aria-label="Batch export progress"
          :aria-valuenow="store.batchProgressCompleted"
          :aria-valuemin="0"
          :aria-valuemax="store.batchProgressTotal"
        >
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
        <span class="progress-text">{{ progressPercent }}% ({{ store.batchProgressCompleted }}/{{ store.batchProgressTotal }})</span>
      </div>

      <p v-if="store.exportError" class="footer-error" role="alert">{{ store.exportError }}</p>

      <div v-if="store.batchItemsState.length > 0" class="batch-report-panel">
        <div class="nested-row-head">
          <span>Batch report ({{ store.batchItemsState.length }})</span>
          <button
            v-if="store.lastBatchReport?.zipData"
            type="button"
            class="inline-btn"
            @click="store.downloadBatchZip()"
          >
            Download ZIP
          </button>
        </div>
        <ul class="batch-report-list">
          <li v-for="item in store.batchItemsState" :key="item.id" class="batch-report-row">
            <span class="report-status" :class="`st-${item.status}`">{{ item.status }}</span>
            <span class="report-name" :title="item.filename">{{ item.filename }}</span>
            <button
              v-if="item.status === 'completed' && item.result"
              type="button"
              class="inline-btn"
              @click="store.downloadBatchItem(item)"
            >
              {{ item.sizeBytes ? formatByteSize(item.sizeBytes) : 'Save' }}
            </button>
          </li>
        </ul>
      </div>

      <span>Generated locally in your browser · C++23 WASM Worker</span>
    </footer>
  </aside>
</template>
