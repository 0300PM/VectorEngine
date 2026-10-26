<script setup lang="ts">
import { useCollapsibleSection } from '@/composables/useCollapsibleSection'
import UiIcon from './UiIcon.vue'

const props = withDefaults(
  defineProps<{
    id: string
    title: string
    hint?: string | undefined
    collapsible?: boolean
    defaultOpen?: boolean
    storageKey?: string | undefined
  }>(),
  {
    hint: undefined,
    collapsible: true,
    defaultOpen: true,
    storageKey: undefined,
  },
)

const section = useCollapsibleSection(props.storageKey ?? props.id, props.defaultOpen)
const collapsed = section.collapsed
const headingId = `${props.id}-heading`
const bodyId = `${props.id}-body`

const toggle = (): void => {
  if (props.collapsible) {
    section.toggle()
  }
}
</script>

<template>
  <section
    class="inspector-section"
    :class="{ 'is-collapsed': props.collapsible && collapsed }"
    :aria-labelledby="headingId"
    :data-section="props.id"
  >
    <div class="section-heading">
      <button
        v-if="props.collapsible"
        type="button"
        class="section-toggle"
        :aria-expanded="!collapsed"
        :aria-controls="bodyId"
        :title="collapsed ? `Expand ${props.title}` : `Collapse ${props.title}`"
        @click="toggle"
      >
        <UiIcon name="chevron" class="section-caret" :class="{ 'is-open': !collapsed }" :size="12" />
        <span :id="headingId" class="section-title">{{ props.title }}</span>
      </button>
      <span v-else :id="headingId" class="section-title is-static">{{ props.title }}</span>

      <div class="section-heading-meta">
        <small v-if="props.hint" class="section-hint">{{ props.hint }}</small>
        <slot name="heading-extra" />
      </div>
    </div>

    <div v-show="!collapsed" :id="bodyId" class="section-body">
      <slot />
    </div>
  </section>
</template>
