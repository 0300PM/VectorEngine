<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <label class="flex flex-col gap-1 text-xs text-slate-300">
    <span>{{ label }}</span>
    <slot />
  </label>
</template>
