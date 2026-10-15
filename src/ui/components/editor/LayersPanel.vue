<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useDocumentStore } from '@/app/stores'
import { useMessages } from '@/i18n'
import BasePanel from '../base/BasePanel.vue'
import NodeTree from './NodeTree.vue'

const { t } = useMessages()
const documentStore = useDocumentStore()
const { document } = storeToRefs(documentStore)
</script>

<template>
  <BasePanel :title="t('layers.title')">
    <p v-if="document.layers.length === 0" class="text-xs text-slate-400">
      {{ t('layers.empty') }}
    </p>
    <ul v-else class="space-y-3">
      <li v-for="layer in document.layers" :key="layer.id">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded border text-[11px] transition"
            :class="
              layer.visible
                ? 'border-emerald-500/60 text-emerald-200 hover:bg-emerald-500/10'
                : 'border-slate-700 text-slate-500 hover:bg-slate-800'
            "
            :aria-label="layer.visible ? t('layers.hide') : t('layers.show')"
            :aria-pressed="layer.visible"
            @click="documentStore.setLayerVisibility(layer.id, !layer.visible)"
          >
            <svg
              viewBox="0 0 20 20"
              class="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            >
              <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" />
              <circle cx="10" cy="10" r="2.5" />
              <path v-if="!layer.visible" d="M4 16 16 4" />
            </svg>
          </button>
          <span
            class="text-sm font-medium"
            :class="layer.visible ? 'text-slate-100' : 'text-slate-500'"
          >
            {{ layer.name }}
          </span>
          <span v-if="layer.locked" class="text-[10px] uppercase tracking-wide text-slate-500">
            {{ t('layers.locked') }}
          </span>
          <span v-if="layer.opacity < 1" class="text-xs text-slate-500">
            {{ t('layers.opacity', { value: Math.round(layer.opacity * 100) }) }}
          </span>
        </div>
        <NodeTree :nodes="layer.children" class="mt-2" />
      </li>
    </ul>
  </BasePanel>
</template>
