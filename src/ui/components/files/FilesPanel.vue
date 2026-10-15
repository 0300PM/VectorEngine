<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, useTemplateRef } from 'vue'
import { useFilesStore } from '@/app/stores'
import { useMessages } from '@/i18n'
import BaseButton from '../base/BaseButton.vue'
import BaseField from '../base/BaseField.vue'
import BasePanel from '../base/BasePanel.vue'
import BaseSelect, { type SelectOption } from '../base/BaseSelect.vue'
import CompatibilityList from './CompatibilityList.vue'
import ConversionSummary from './ConversionSummary.vue'

const { t } = useMessages()
const filesStore = useFilesStore()
const {
  isBusy,
  writers,
  acceptedFileTypes,
  targetFormatId,
  targetWriter,
  compatibility,
  isBlocked,
  lastReport,
} = storeToRefs(filesStore)

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const writerOptions = computed<SelectOption<string>[]>(() =>
  writers.value.map((writer) => ({
    value: writer.id,
    label: `${writer.label} (${writer.extensions.join(', ')})`,
  })),
)

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
    <div class="flex flex-wrap items-end gap-3">
      <BaseButton variant="primary" :disabled="isBusy" @click="fileInput?.click()">
        {{ t('files.open') }}
      </BaseButton>
      <BaseField :label="t('files.target')">
        <BaseSelect v-model="targetFormatId" :options="writerOptions" :disabled="isBusy" />
      </BaseField>
      <BaseButton
        variant="success"
        :disabled="isBusy || !targetWriter || isBlocked"
        @click="filesStore.saveAs()"
      >
        {{ t('files.save', { format: targetWriter?.label ?? '' }) }}
      </BaseButton>
    </div>

    <p v-if="isBlocked" class="mt-2 text-xs text-rose-300">{{ t('files.blocked') }}</p>

    <div class="mt-4 space-y-3">
      <CompatibilityList v-if="compatibility" :report="compatibility" />
      <ConversionSummary
        v-if="lastReport"
        :report="lastReport"
        @download="filesStore.downloadReport()"
      />
    </div>
  </BasePanel>
</template>
