<script setup lang="ts">
import { computed } from 'vue'
import type { FieldState, SelectField } from '@/inspector/fields'
import type { SceneObject } from '@/types/scene'
import { useEngineStore } from '@/stores/engine'

const props = defineProps<{ state: FieldState }>()

const store = useEngineStore()

const field = computed<SelectField | null>(() =>
  props.state.field.kind === 'select' ? props.state.field : null,
)

const handleFocus = (): void => {
  store.beginInspectorEdit()
}

const handleChange = (event: Event): void => {
  const current = field.value
  if (!current) {
    return
  }
  const value = (event.target as HTMLSelectElement).value
  const write = (object: SceneObject): Record<string, unknown> => current.write(object, value)
  store.applyObjectPatch(store.selectedObjectIds, write)
  store.commitInspectorEdit()
}
</script>

<template>
  <div v-if="field" class="stack-field">
    <span class="split-row">
      <span>{{ field.label }}</span>
      <em v-if="props.state.mixed" class="mixed-tag">mixed</em>
    </span>
    <select
      class="inspector-select"
      :value="props.state.value ?? ''"
      :aria-label="field.label"
      @focus="handleFocus"
      @change="handleChange"
    >
      <option v-for="option in field.options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </div>
</template>
