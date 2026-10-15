<script setup lang="ts" generic="T extends string | number">
export type SelectOption<Value> = { readonly value: Value; readonly label: string }

const { options, disabled = false } = defineProps<{
  options: readonly SelectOption<T>[]
  disabled?: boolean
}>()

const model = defineModel<T>({ required: true })

const onChange = (event: Event): void => {
  const selected = (event.target as HTMLSelectElement).value
  const option = options.find((candidate) => String(candidate.value) === selected)
  if (option) {
    model.value = option.value
  }
}
</script>

<template>
  <select
    :value="String(model)"
    :disabled="disabled"
    class="block rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none transition focus:border-blue-400 disabled:opacity-60"
    @change="onChange"
  >
    <option v-for="option in options" :key="String(option.value)" :value="String(option.value)">
      {{ option.label }}
    </option>
  </select>
</template>
