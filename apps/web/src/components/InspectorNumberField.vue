<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { resolveBound, validateNumber } from '@/inspector/validation'
import type { FieldState, NumberField } from '@/inspector/fields'
import type { SceneObject } from '@/types/scene'
import { useEngineStore } from '@/stores/engine'

const props = defineProps<{ state: FieldState }>()

const store = useEngineStore()

const field = computed<NumberField | null>(() =>
  props.state.field.kind === 'number' ? props.state.field : null,
)

const draft = ref('')
const focused = ref(false)
const errorMessage = ref('')

const bounds = computed(() => {
  const current = field.value
  const representative = props.state.representative
  if (!current || !representative) {
    return { min: undefined as number | undefined, max: undefined as number | undefined }
  }
  return {
    min: resolveBound(current.min, representative),
    max: resolveBound(current.max, representative),
  }
})

const syncDraft = (): void => {
  if (focused.value) {
    return
  }
  const value = props.state.value
  draft.value = value === null || value === undefined ? '' : String(value)
}

watch(() => [props.state.value, props.state.mixed] as const, syncDraft, { immediate: true })

const applyDraft = (): void => {
  const current = field.value
  const representative = props.state.representative
  if (!current || !representative) {
    return
  }
  const result = validateNumber(current, representative, draft.value)
  if (!result.valid) {
    errorMessage.value = result.message
    return
  }
  errorMessage.value = ''
  const write = (object: SceneObject): Record<string, unknown> => current.write(object, result.value)
  store.applyObjectPatch(store.selectedObjectIds, write)
}

const handleInput = (event: Event): void => {
  draft.value = (event.target as HTMLInputElement).value
  applyDraft()
}

const handleFocus = (): void => {
  focused.value = true
  store.beginInspectorEdit()
}

const handleChange = (): void => {
  applyDraft()
  if (errorMessage.value) {
    store.cancelInspectorEdit()
  } else {
    store.commitInspectorEdit()
  }
}

const handleBlur = (): void => {
  focused.value = false
  store.cancelInspectorEdit()
  syncDraft()
}
</script>

<template>
  <div v-if="field" class="stack-field">
    <span class="split-row">
      <span>{{ field.label }}</span>
      <em v-if="props.state.mixed" class="mixed-tag">mixed</em>
    </span>
    <label class="field-group full bare" :class="{ error: errorMessage }">
      <input
        type="number"
        :value="draft"
        :min="bounds.min"
        :max="bounds.max"
        :step="field.step ?? 1"
        :aria-label="field.label"
        @input="handleInput"
        @focus="handleFocus"
        @change="handleChange"
        @blur="handleBlur"
      />
      <em>{{ field.unit ?? '' }}</em>
    </label>
    <span v-if="errorMessage" class="field-error" role="alert">{{ errorMessage }}</span>
  </div>
</template>
