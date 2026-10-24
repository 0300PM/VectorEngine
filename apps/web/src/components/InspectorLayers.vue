<script setup lang="ts">
import { computed } from 'vue'
import type { ObjectType } from '@/inspector/fields'
import { useEngineStore } from '@/stores/engine'
import UiIcon from './UiIcon.vue'
import type { IconName } from '@/ui/icons'

const store = useEngineStore()

const iconForType = (type: string): IconName => {
  switch (type as ObjectType) {
    case 'rect':
      return 'rect'
    case 'circle':
      return 'circle'
    case 'ellipse':
      return 'ellipse'
    case 'line':
      return 'line'
    case 'polygon':
      return 'polygon'
    case 'polyline':
      return 'polyline'
    case 'path':
      return 'path'
    case 'text':
      return 'text'
    case 'group':
      return 'group'
    default:
      return 'info'
  }
}

const isSelected = (id: string): boolean => store.selectedObjectIds.includes(id)

const objects = computed(() => store.sceneCatalog.objects)

const handleSelect = (id: string, event: MouseEvent): void => {
  store.selectInspectorObject(id, event.metaKey || event.ctrlKey)
}
</script>

<template>
  <section class="inspector-section layers-section" aria-labelledby="inspector-layers-heading">
    <div class="section-heading">
      <label id="inspector-layers-heading">Layers</label>
      <small class="section-hint">{{ objects.length }} objects</small>
    </div>
    <ul class="layers-list" role="listbox" aria-label="Scene layers" multiple>
      <li v-for="entry in objects" :key="entry.id" class="layer-item">
        <button
          type="button"
          class="layer-row"
          :class="{ selected: isSelected(entry.id), muted: entry.visible === false }"
          role="option"
          :aria-selected="isSelected(entry.id)"
          :aria-label="`${entry.label} (${entry.type})`"
          @click="handleSelect(entry.id, $event)"
        >
          <UiIcon :name="iconForType(entry.type)" :size="12" />
          <span class="layer-name">{{ entry.label }}</span>
          <span class="layer-type">{{ entry.type }}</span>
        </button>
        <button
          type="button"
          class="visibility-button"
          :title="entry.visible ? 'Hide layer' : 'Show layer'"
          :aria-label="entry.visible ? `Hide ${entry.label}` : `Show ${entry.label}`"
          @click.stop="store.toggleInspectorVisibility(entry.id)"
        >
          <UiIcon :name="entry.visible ? 'eye' : 'eye-off'" :size="12" />
        </button>
      </li>
    </ul>
  </section>
</template>
