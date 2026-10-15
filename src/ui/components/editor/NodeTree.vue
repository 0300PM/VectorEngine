<script setup lang="ts">
import type { VectorNode } from '@/core/document'
import { useMessages } from '@/i18n'

defineProps<{ nodes: readonly VectorNode[] }>()

const { t } = useMessages()
</script>

<template>
  <ul class="ml-2 space-y-1 border-l border-slate-800 pl-3">
    <li v-for="node in nodes" :key="node.id" class="text-xs">
      <div class="flex items-center gap-2">
        <span
          class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400"
        >
          {{ t(`layers.nodeType.${node.type}`) }}
        </span>
        <span class="truncate text-slate-200">{{ node.name ?? node.id }}</span>
        <span v-if="node.opacity < 1" class="text-slate-500">
          {{ t('layers.opacity', { value: Math.round(node.opacity * 100) }) }}
        </span>
      </div>
      <NodeTree v-if="node.type === 'group'" :nodes="node.children" class="mt-1" />
    </li>
  </ul>
</template>
