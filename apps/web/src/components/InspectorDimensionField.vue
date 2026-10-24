<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dimensionRatio, type FieldState, type NumberField } from '@/inspector/fields'
import { resolveBound, validateNumber } from '@/inspector/validation'
import type { SceneObject } from '@/types/scene'
import { useEngineStore } from '@/stores/engine'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ width: FieldState; height: FieldState }>()

const store = useEngineStore()

const widthField = computed<NumberField | null>(() =>
  props.width.field.kind === 'number' ? props.width.field : null,
)
const heightField = computed<NumberField | null>(() =>
  props.height.field.kind === 'number' ? props.height.field : null,
)

const widthDraft = ref('')
const heightDraft = ref('')
const focusedSide = ref<'width' | 'height' | null>(null)
const widthError = ref('')
const heightError = ref('')

const widthBounds = computed(() => {
  const current = widthField.value
  const representative = props.width.representative
  if (!current || !representative) {
    return { min: undefined as number | undefined, max: undefined as number | undefined }
  }
  return {
    min: resolveBound(current.min, representative),
    max: resolveBound(current.max, representative),
  }
})

const heightBounds = computed(() => {
  const current = heightField.value
  const representative = props.height.representative
  if (!current || !representative) {
    return { min: undefined as number | undefined, max: undefined as number | undefined }
  }
  return {
    min: resolveBound(current.min, representative),
    max: resolveBound(current.max, representative),
  }
})

const syncDrafts = (): void => {
  if (focusedSide.value !== null) {
    return
  }
  widthDraft.value = formatValue(props.width.value)
  heightDraft.value = formatValue(props.height.value)
}

const formatValue = (value: number | string | null): string =>
  value === null || value === undefined ? '' : String(value)

watch(
  () => [props.width.value, props.height.value, props.width.mixed, props.height.mixed] as const,
  syncDrafts,
  { immediate: true },
)

const applyWidth = (): void => {
  const current = widthField.value
  const representative = props.width.representative
  if (!current || !representative) {
    return
  }
  const result = validateNumber(current, representative, widthDraft.value)
  if (!result.valid) {
    widthError.value = result.message
    return
  }
  widthError.value = ''
  const write = (object: SceneObject): Record<string, unknown> => {
    const patch = current.write(object, result.value)
    if (store.inspectorLockAspect) {
      const ratio = dimensionRatio(object)
      const paired = heightField.value
      if (ratio && paired) {
        Object.assign(patch, paired.write(object, Math.round(result.value / ratio)))
      }
    }
    return patch
  }
  store.applyObjectPatch(store.selectedObjectIds, write)
}

const applyHeight = (): void => {
  const current = heightField.value
  const representative = props.height.representative
  if (!current || !representative) {
    return
  }
  const result = validateNumber(current, representative, heightDraft.value)
  if (!result.valid) {
    heightError.value = result.message
    return
  }
  heightError.value = ''
  const write = (object: SceneObject): Record<string, unknown> => {
    const patch = current.write(object, result.value)
    if (store.inspectorLockAspect) {
      const ratio = dimensionRatio(object)
      const paired = widthField.value
      if (ratio && paired) {
        Object.assign(patch, paired.write(object, Math.round(result.value * ratio)))
      }
    }
    return patch
  }
  store.applyObjectPatch(store.selectedObjectIds, write)
}

const handleWidthInput = (event: Event): void => {
  widthDraft.value = (event.target as HTMLInputElement).value
  applyWidth()
}

const handleHeightInput = (event: Event): void => {
  heightDraft.value = (event.target as HTMLInputElement).value
  applyHeight()
}

const handleFocus = (side: 'width' | 'height'): void => {
  focusedSide.value = side
  store.beginInspectorEdit()
}

const handleChange = (side: 'width' | 'height'): void => {
  if (side === 'width') {
    applyWidth()
  } else {
    applyHeight()
  }
  if (widthError.value || heightError.value) {
    store.cancelInspectorEdit()
  } else {
    store.commitInspectorEdit()
  }
}

const handleBlur = (): void => {
  focusedSide.value = null
  store.cancelInspectorEdit()
  syncDrafts()
}
</script>

<template>
  <div class="stack-field">
    <span class="split-row">
      <span>Size</span>
      <em v-if="props.width.mixed || props.height.mixed" class="mixed-tag">mixed</em>
    </span>
    <div class="dimension-row">
      <label class="field-group" :class="{ error: widthError }">
        <span>W</span>
        <input
          type="number"
          :value="widthDraft"
          :min="widthBounds.min"
          :max="widthBounds.max"
          :step="widthField?.step ?? 1"
          aria-label="Width"
          @input="handleWidthInput"
          @focus="handleFocus('width')"
          @change="handleChange('width')"
          @blur="handleBlur"
        />
        <em>px</em>
      </label>
      <button
        class="lock-button"
        type="button"
        :aria-pressed="store.inspectorLockAspect"
        :title="store.inspectorLockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'"
        aria-label="Lock aspect ratio"
        @click="store.setInspectorLockAspect(!store.inspectorLockAspect)"
      >
        <UiIcon :name="store.inspectorLockAspect ? 'lock' : 'unlock'" :size="14" />
      </button>
      <label class="field-group" :class="{ error: heightError }">
        <span>H</span>
        <input
          type="number"
          :value="heightDraft"
          :min="heightBounds.min"
          :max="heightBounds.max"
          :step="heightField?.step ?? 1"
          aria-label="Height"
          @input="handleHeightInput"
          @focus="handleFocus('height')"
          @change="handleChange('height')"
          @blur="handleBlur"
        />
        <em>px</em>
      </label>
    </div>
    <span v-if="widthError || heightError" class="field-error" role="alert">
      {{ widthError || heightError }}
    </span>
  </div>
</template>
