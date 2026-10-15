<script setup lang="ts">
const { min, max, step = 1 } = defineProps<{ min?: number; max?: number; step?: number }>()

const model = defineModel<number>({ required: true })

const onInput = (event: Event): void => {
  const next = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(next)) {
    model.value = next
  }
}
</script>

<template>
  <input
    type="number"
    :value="model"
    :min="min"
    :max="max"
    :step="step"
    class="block w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none transition focus:border-blue-400"
    @input="onInput"
  />
</template>
