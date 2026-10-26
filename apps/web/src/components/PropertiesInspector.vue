<script setup lang="ts">
import { computed } from 'vue'
import {
  INSPECTOR_FIELDS,
  fieldAppliesToAny,
  resolveFieldState,
  type FieldSection,
  type FieldState,
} from '@/inspector/fields'
import { findObjectsById } from '@/inspector/sceneTree'
import { useEngineStore } from '@/stores/engine'
import InspectorColorField from './InspectorColorField.vue'
import InspectorDimensionField from './InspectorDimensionField.vue'
import InspectorLayers from './InspectorLayers.vue'
import InspectorNumberField from './InspectorNumberField.vue'
import InspectorSelectField from './InspectorSelectField.vue'
import InspectorSection from './InspectorSection.vue'
import InspectorTextField from './InspectorTextField.vue'
import UiIcon from './UiIcon.vue'

type InspectorRow =
  | { kind: 'field'; state: FieldState }
  | { kind: 'dimension'; width: FieldState; height: FieldState }

const emit = defineEmits<{ collapse: [] }>()

const store = useEngineStore()

const selectedObjects = computed(() => {
  if (!store.scene) {
    return []
  }
  return findObjectsById(store.scene, store.selectedObjectIds)
})

const fieldStates = computed<FieldState[]>(() => {
  const objects = selectedObjects.value
  const types = new Set(objects.map((object) => object.type))
  return INSPECTOR_FIELDS
    .filter((field) => fieldAppliesToAny(field, types))
    .map((field) => resolveFieldState(field, objects))
})

const rowsBySection = computed<Record<FieldSection, InspectorRow[]>>(() => {
  const sections: Record<FieldSection, InspectorRow[]> = {
    Transform: [],
    Appearance: [],
    Shape: [],
  }
  const consumed = new Set<string>()

  for (const state of fieldStates.value) {
    if (consumed.has(state.field.key)) {
      continue
    }
    if (state.field.key === 'width') {
      const heightState = fieldStates.value.find((item) => item.field.key === 'height')
      if (heightState) {
        consumed.add('height')
        sections[state.field.section].push({ kind: 'dimension', width: state, height: heightState })
        continue
      }
    }
    sections[state.field.section].push({ kind: 'field', state })
  }

  return sections
})

const hasSelection = computed(() => selectedObjects.value.length > 0)

const selectionLabel = computed(() => {
  if (!hasSelection.value) {
    return 'No selection'
  }
  const [first] = selectedObjects.value
  if (selectedObjects.value.length === 1 && first) {
    return first.name ?? first.id
  }
  return `${selectedObjects.value.length} objects`
})

const rowKey = (row: InspectorRow): string =>
  row.kind === 'dimension' ? 'dimension' : row.state.field.key
</script>

<template>
  <aside class="workspace-panel properties-panel" aria-label="Object properties">
    <header class="panel-heading">
      <div>
        <div class="panel-eyebrow">PROPERTIES</div>
        <h2 class="panel-title">Inspector</h2>
      </div>
      <div class="panel-heading-actions">
        <button
          type="button"
          class="panel-collapse"
          title="Collapse panel"
          aria-label="Collapse Properties panel"
          @click="emit('collapse')"
        >
          <UiIcon name="chevron" :size="13" />
        </button>
        <div class="inspector-history" role="group" aria-label="Undo and redo">
          <button
            type="button"
            :disabled="!store.canUndo"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            @click="store.undo()"
          >
            <UiIcon name="undo" :size="14" />
          </button>
          <button
            type="button"
            :disabled="!store.canRedo"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            @click="store.redo()"
          >
            <UiIcon name="redo" :size="14" />
          </button>
        </div>
      </div>
    </header>

    <div class="inspector-scroll">
      <InspectorLayers />

      <div v-if="!hasSelection" class="inspector-empty">
        <UiIcon name="info" :size="20" />
        <strong>Nothing selected</strong>
        <span>Pick an object from the layers list to edit its properties.</span>
      </div>

      <template v-else>
        <div class="selection-summary">
          <span class="selection-count">{{ store.selectedObjectIds.length }}</span>
          <span class="selection-label">{{ selectionLabel }}</span>
        </div>

        <InspectorSection id="inspector-transform" title="Transform" storage-key="inspector.transform">
          <template v-for="row in rowsBySection.Transform" :key="rowKey(row)">
            <InspectorDimensionField
              v-if="row.kind === 'dimension'"
              :width="row.width"
              :height="row.height"
            />
            <InspectorNumberField v-else-if="row.state.field.kind === 'number'" :state="row.state" />
            <InspectorColorField v-else-if="row.state.field.kind === 'color'" :state="row.state" />
            <InspectorSelectField v-else-if="row.state.field.kind === 'select'" :state="row.state" />
            <InspectorTextField v-else-if="row.state.field.kind === 'text'" :state="row.state" />
            <div v-else class="stack-field">
              <span class="split-row"><span>{{ row.state.field.label }}</span></span>
              <div class="info-value">{{ row.state.value }}</div>
            </div>
          </template>
        </InspectorSection>

        <InspectorSection id="inspector-appearance" title="Appearance" storage-key="inspector.appearance">
          <template v-for="row in rowsBySection.Appearance" :key="rowKey(row)">
            <InspectorNumberField
              v-if="row.kind === 'field' && row.state.field.kind === 'number'"
              :state="row.state"
            />
            <InspectorColorField
              v-else-if="row.kind === 'field' && row.state.field.kind === 'color'"
              :state="row.state"
            />
            <InspectorSelectField
              v-else-if="row.kind === 'field' && row.state.field.kind === 'select'"
              :state="row.state"
            />
            <InspectorTextField
              v-else-if="row.kind === 'field' && row.state.field.kind === 'text'"
              :state="row.state"
            />
          </template>
        </InspectorSection>

        <InspectorSection
          id="inspector-shape"
          title="Shape"
          storage-key="inspector.shape"
          :hint="rowsBySection.Shape.length === 0 ? 'No shape parameters' : undefined"
        >
          <template v-for="row in rowsBySection.Shape" :key="rowKey(row)">
            <InspectorDimensionField
              v-if="row.kind === 'dimension'"
              :width="row.width"
              :height="row.height"
            />
            <InspectorNumberField
              v-else-if="row.kind === 'field' && row.state.field.kind === 'number'"
              :state="row.state"
            />
            <InspectorColorField
              v-else-if="row.kind === 'field' && row.state.field.kind === 'color'"
              :state="row.state"
            />
            <InspectorSelectField
              v-else-if="row.kind === 'field' && row.state.field.kind === 'select'"
              :state="row.state"
            />
            <InspectorTextField
              v-else-if="row.kind === 'field' && row.state.field.kind === 'text'"
              :state="row.state"
            />
            <div v-else-if="row.kind === 'field'" class="stack-field">
              <span class="split-row"><span>{{ row.state.field.label }}</span></span>
              <div class="info-value">{{ row.state.value }}</div>
            </div>
          </template>
        </InspectorSection>
      </template>
    </div>
  </aside>
</template>
