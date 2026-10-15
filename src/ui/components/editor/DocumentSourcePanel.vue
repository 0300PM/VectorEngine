<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useDocumentStore } from '@/app/stores'
import { CURRENT_SCHEMA_VERSION } from '@/core/document'
import { useMessages } from '@/i18n'
import { useDebouncedCallback } from '../../composables/useDebouncedCallback'
import BaseButton from '../base/BaseButton.vue'
import BasePanel from '../base/BasePanel.vue'

const VALIDATION_DELAY_MS = 250

const { t } = useMessages()
const documentStore = useDocumentStore()
const { source, isDirty, isValid, canUndo, canRedo, nodeCount } = storeToRefs(documentStore)

const { run: validateLater } = useDebouncedCallback(
  () => documentStore.validateSource(),
  VALIDATION_DELAY_MS,
)

const onKeydown = (event: KeyboardEvent): void => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    documentStore.applySource()
  }
}
</script>

<template>
  <BasePanel
    :title="t('editor.title')"
    :subtitle="t('editor.hint', { version: CURRENT_SCHEMA_VERSION })"
  >
    <template #actions>
      <BaseButton size="sm" variant="ghost" :disabled="!canUndo" @click="documentStore.undo()">
        {{ t('editor.undo') }}
      </BaseButton>
      <BaseButton size="sm" variant="ghost" :disabled="!canRedo" @click="documentStore.redo()">
        {{ t('editor.redo') }}
      </BaseButton>
      <BaseButton size="sm" @click="documentStore.loadSample()">{{
        t('editor.sample')
      }}</BaseButton>
    </template>

    <textarea
      v-model="source"
      spellcheck="false"
      class="h-[420px] w-full resize-y rounded-lg border bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none transition focus:border-blue-400"
      :class="isValid ? 'border-slate-700' : 'border-rose-500/70'"
      :aria-invalid="!isValid"
      @input="validateLater"
      @keydown="onKeydown"
    />

    <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
      <BaseButton variant="primary" :disabled="!isDirty" @click="documentStore.applySource()">
        {{ t('editor.apply') }}
        <kbd class="rounded border border-blue-300/40 px-1 text-[10px] font-normal opacity-80">
          {{ t('editor.applyShortcut') }}
        </kbd>
      </BaseButton>
      <p class="text-xs text-slate-400">
        {{ t('editor.nodes', nodeCount) }}
        <span v-if="isDirty" class="ml-2 text-amber-300">· {{ t('editor.dirty') }}</span>
      </p>
    </div>
  </BasePanel>
</template>
