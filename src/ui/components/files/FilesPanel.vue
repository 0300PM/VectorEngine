<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTemplateRef } from 'vue'
import { useFilesStore } from '@/app/stores'
import { useMessages, type MessageKey } from '@/i18n'
import BaseButton from '../base/BaseButton.vue'
import BasePanel from '../base/BasePanel.vue'

const { t } = useMessages()
const filesStore = useFilesStore()
const { isBusy, writers, acceptedFileTypes, writerWarnings } = storeToRefs(filesStore)

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const saveLabels: Readonly<Record<string, MessageKey>> = {
  vex: 'files.saveVex',
  'document-json': 'files.saveJson',
}

const onFileSelected = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) {
    await filesStore.importFile(file)
  }
}
</script>

<template>
  <BasePanel :title="t('files.title')" :subtitle="t('files.accepted')">
    <input
      ref="fileInput"
      type="file"
      class="sr-only"
      :accept="acceptedFileTypes"
      @change="onFileSelected"
    />
    <div class="flex flex-wrap gap-3">
      <BaseButton variant="primary" :disabled="isBusy" @click="fileInput?.click()">
        {{ t('files.open') }}
      </BaseButton>
      <BaseButton
        v-for="writer in writers"
        :key="writer.id"
        :disabled="isBusy"
        @click="filesStore.saveAs(writer.id)"
      >
        {{ saveLabels[writer.id] ? t(saveLabels[writer.id]!) : writer.label }}
      </BaseButton>
    </div>
    <ul class="mt-3 space-y-1 text-xs text-amber-300">
      <template v-for="writer in writers" :key="writer.id">
        <li
          v-for="warning in writerWarnings[writer.id] ?? []"
          :key="`${writer.id}-${warning.code}`"
        >
          {{ writer.label }}: {{ t(`warnings.${warning.code}`, { detail: warning.detail ?? '' }) }}
        </li>
      </template>
    </ul>
  </BasePanel>
</template>
