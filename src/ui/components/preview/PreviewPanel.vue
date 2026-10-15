<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, useTemplateRef } from 'vue'
import { useRenderStore } from '@/app/stores'
import { engineKinds, type EngineKind } from '@/engine'
import { useMessages } from '@/i18n'
import { useCanvasPainter } from '../../composables/useCanvasPainter'
import BaseButton from '../base/BaseButton.vue'
import BasePanel from '../base/BasePanel.vue'
import BaseSelect, { type SelectOption } from '../base/BaseSelect.vue'
import StatusLine from '../StatusLine.vue'

const { t } = useMessages()
const renderStore = useRenderStore()
const { result, isRendering, preference } = storeToRefs(renderStore)

const canvas = useTemplateRef<HTMLCanvasElement>('preview')
useCanvasPainter(canvas, () => result.value)

const engineOptions = computed<SelectOption<EngineKind>[]>(() =>
  engineKinds.map((kind) => ({ value: kind, label: t(`engine.${kind}`) })),
)

const subtitle = computed(() =>
  result.value
    ? t('preview.size', { width: result.value.width, height: result.value.height })
    : t('preview.empty'),
)
</script>

<template>
  <BasePanel :title="t('preview.title')" :subtitle="subtitle">
    <template #actions>
      <BaseSelect
        v-model="preference"
        :options="engineOptions"
        :aria-label="t('engine.preference')"
      />
      <BaseButton variant="primary" :disabled="isRendering" @click="renderStore.renderPreview()">
        {{ isRendering ? t('engine.rendering') : t('engine.render') }}
      </BaseButton>
    </template>

    <div
      class="checkerboard relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg border border-slate-800 p-2"
    >
      <canvas
        ref="preview"
        class="max-h-[70vh] max-w-full rounded shadow-2xl shadow-black/40 transition-opacity"
        :class="isRendering ? 'opacity-60' : 'opacity-100'"
      />
    </div>
    <StatusLine class="mt-3" />
  </BasePanel>
</template>
