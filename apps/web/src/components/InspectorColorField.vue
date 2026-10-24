<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { isHexPaint, validatePaint } from '@/inspector/validation'
import type { ColorField, FieldState } from '@/inspector/fields'
import type { SceneObject } from '@/types/scene'
import { useEngineStore } from '@/stores/engine'

const props = defineProps<{ state: FieldState }>()

const store = useEngineStore()

const field = computed<ColorField | null>(() =>
  props.state.field.kind === 'color' ? props.state.field : null,
)

const draft = ref('')
const focused = ref(false)
const errorMessage = ref('')

const paintValue = computed(() => (typeof props.state.value === 'string' ? props.state.value : ''))
const isNone = computed(() => paintValue.value === 'none')
const showPicker = computed(() => isHexPaint(paintValue.value))
const swatchStyle = computed(() => {
  const value = paintValue.value
  if (!value || value === 'none') {
    return {}
  }
  return { background: value }
})

const syncDraft = (): void => {
  if (focused.value) {
    return
  }
  draft.value = paintValue.value
}

watch(() => [props.state.value, props.state.mixed] as const, syncDraft, { immediate: true })

const applyPaint = (raw: string): boolean => {
  const current = field.value
  if (!current) {
    return false
  }
  const result = validatePaint(raw)
  if (!result.valid) {
    errorMessage.value = result.message
    return false
  }
  errorMessage.value = ''
  const write = (object: SceneObject): Record<string, unknown> => current.write(object, result.normalized)
  store.applyObjectPatch(store.selectedObjectIds, write)
  return true
}

const handleInput = (event: Event): void => {
  draft.value = (event.target as HTMLInputElement).value
  applyPaint(draft.value)
}

const handlePickerInput = (event: Event): void => {
  const value = (event.target as HTMLInputElement).value.toUpperCase()
  draft.value = value
  applyPaint(value)
}

const handleFocus = (): void => {
  focused.value = true
  store.beginInspectorEdit()
}

const handleChange = (): void => {
  if (applyPaint(draft.value)) {
    store.commitInspectorEdit()
  } else {
    store.cancelInspectorEdit()
  }
}

const handleBlur = (): void => {
  focused.value = false
  store.cancelInspectorEdit()
  syncDraft()
}

const setNone = (): void => {
  draft.value = 'none'
  applyPaint('none')
  store.commitInspectorEdit()
}
</script>

<template>
  <div v-if="field" class="stack-field">
    <span class="split-row">
      <span>{{ field.label }}</span>
      <em v-if="props.state.mixed" class="mixed-tag">mixed</em>
    </span>
    <div class="color-row">
      <span
        class="color-swatch"
        :class="{ checker: !paintValue || isNone }"
        :style="swatchStyle"
        aria-hidden="true"
      />
      <label class="field-group full bare" :class="{ error: errorMessage }">
        <input
          type="text"
          :value="draft"
          :aria-label="`${field.label} value`"
          spellcheck="false"
          @input="handleInput"
          @focus="handleFocus"
          @change="handleChange"
          @blur="handleBlur"
        />
      </label>
      <input
        v-if="showPicker"
        class="color-picker"
        type="color"
        :value="paintValue"
        :aria-label="`${field.label} picker`"
        @input="handlePickerInput"
      />
      <button
        v-if="field.allowNone"
        class="mini-chip"
        :class="{ selected: isNone }"
        type="button"
        :aria-pressed="isNone"
        @click="setNone"
      >
        None
      </button>
    </div>
    <span v-if="errorMessage" class="field-error" role="alert">{{ errorMessage }}</span>
  </div>
</template>
