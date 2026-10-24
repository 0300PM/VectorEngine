<script setup lang="ts">
const props = defineProps<{ id: string; title: string; hint?: string | undefined }>()
</script>

<template>
  <section class="inspector-section" :aria-labelledby="props.id">
    <div class="section-heading">
      <label :id="props.id">{{ props.title }}</label>
      <small v-if="props.hint" class="section-hint">{{ props.hint }}</small>
    </div>
    <slot />
  </section>
</template>
