<script setup lang="ts">
import UiIcon from './UiIcon.vue'
import type { IconName } from '@/ui/icons'

interface BannerHighlight {
  icon: IconName
  label: string
}

withDefaults(
  defineProps<{
    version?: string
    highlights?: BannerHighlight[]
  }>(),
  {
    version: 'v0.1',
    highlights: () => [
      { icon: 'code', label: 'Versioned JSON scene format with schema validation' },
      { icon: 'preview', label: 'Deterministic C++23 rendering compiled to WebAssembly' },
      { icon: 'export', label: 'Local SVG, PNG, JPEG, and BMP export' },
    ],
  },
)

const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <aside class="app-banner" role="region" aria-label="Product announcement">
    <div class="banner-mark" aria-hidden="true">
      <img src="/brand/banner-icon.svg" alt="" width="30" height="30" />
    </div>

    <div class="banner-body">
      <p class="banner-headline">
        <strong>Vector Engine {{ version }}</strong>
        <span class="banner-tag">JSON in · pixels out</span>
      </p>
      <ul class="banner-highlights">
        <li v-for="item in highlights" :key="item.label">
          <UiIcon :name="item.icon" :size="12" />
          <span>{{ item.label }}</span>
        </li>
      </ul>
    </div>

    <button class="banner-dismiss" type="button" title="Dismiss banner" aria-label="Dismiss banner" @click="emit('dismiss')">
      <UiIcon name="close" :size="13" />
    </button>
  </aside>
</template>
