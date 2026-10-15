<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <section class="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <header class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold tracking-tight text-slate-100">{{ title }}</h2>
        <p v-if="subtitle" class="mt-0.5 text-xs text-slate-400">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </section>
</template>
