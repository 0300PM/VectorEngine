<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FieldState, TextField } from '@/inspector/fields'
import type { SceneObject } from '@/types/scene'
import { useEngineStore } from '@/stores/engine'

const props = defineProps<{ state: FieldState }>()

const store = useEngineStore()

const field = computed<TextField | null>(() =>
  props.state.field.kind === 'text' ? props.state.field : null,
)

const draft = ref('')
const focused = ref(false)
const errorMessage = ref('')

const syncDraft = (): void => {
  if (focused.value) {
    return
  }
  const value = props.state.value
  draft.value = value === null || value === undefined ? '' : String(value)
}

watch(() => props.state.value, syncDraft, { immediate: true })

const applyDraft = (): void => {
  const current = field.value
  if (!current) {
    return
  }
  if (current.maxlength !== undefined && draft.value.length > current.maxlength) {
    errorMessage.value = `Must be at most ${current.maxlength} characters`
    return
  }
  errorMessage.value = ''
  const write = (object: SceneObject): Record<string, unknown> => current.write(object, draft.value)
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
        type="text"
        :value="draft"
        :maxlength="field.maxlength"
        :placeholder="field.placeholder"
        :aria-label="field.label"
        @input="handleInput"
        @focus="handleFocus"
        @change="handleChange"
        @blur="handleBlur"
      />
    </label>
    <span v-if="errorMessage" class="field-error" role="alert">{{ errorMessage }}</span>
  </div>
</template>
