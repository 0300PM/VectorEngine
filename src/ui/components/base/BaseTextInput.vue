<script setup lang="ts">
const { placeholder = '', disabled = false } = defineProps<{
  placeholder?: string
  disabled?: boolean
}>()

const [model, modifiers] = defineModel<string, 'lazy'>({ required: true })

const commit = (event: Event): void => {
  model.value = (event.target as HTMLInputElement).value
}

const onInput = (event: Event): void => {
  if (!modifiers.lazy) {
    commit(event)
  }
}
</script>

<template>
  <input
    type="text"
    :value="model"
    :placeholder="placeholder"
    :disabled="disabled"
    class="block w-36 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none transition focus:border-blue-400 disabled:opacity-60"
    @input="onInput"
    @change="commit"
  />
</template>
