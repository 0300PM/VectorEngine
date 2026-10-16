<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, useTemplateRef } from 'vue'
import { filesFromDataTransfer, filesFromList } from '@/app/services/fileEntries'
import { useBatchStore, useFilesStore } from '@/app/stores'
import { MAX_CONCURRENCY, MIN_CONCURRENCY, conflictPolicies, type ConflictPolicy } from '@/formats'
import { useMessages } from '@/i18n'
import BaseButton from '../base/BaseButton.vue'
import BaseField from '../base/BaseField.vue'
import BaseNumberInput from '../base/BaseNumberInput.vue'
import BasePanel from '../base/BasePanel.vue'
import BaseSelect, { type SelectOption } from '../base/BaseSelect.vue'

const { t } = useMessages()
const store = useBatchStore()
const filesStore = useFilesStore()
const {
  jobs,
  concurrency,
  conflictPolicy,
  keepStructure,
  skipDuplicates,
  isPaused,
  isPackaging,
  isActive,
  hasOutputs,
  summary,
  lastReport,
} = storeToRefs(store)
const { acceptedFileTypes } = storeToRefs(filesStore)

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const folderInput = useTemplateRef<HTMLInputElement>('folderInput')
const isDragging = ref(false)

const conflictOptions = computed<SelectOption<ConflictPolicy>[]>(() =>
  conflictPolicies.map((policy) => ({ value: policy, label: t(`batch.conflict.${policy}`) })),
)

const total = computed(() => jobs.value.length)

const onInputChange = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement
  const files = filesFromList(input.files ?? [])
  input.value = ''
  if (files.length > 0) {
    await store.addFiles(files)
  }
}

const onDrop = async (event: DragEvent): Promise<void> => {
  isDragging.value = false
  if (event.dataTransfer) {
    await store.addFiles(await filesFromDataTransfer(event.dataTransfer))
  }
}
</script>

<template>
  <BasePanel :title="t('batch.title')" :subtitle="t('batch.hint')">
    <input
      ref="fileInput"
      type="file"
      multiple
      class="sr-only"
      :accept="acceptedFileTypes"
      @change="onInputChange"
    />
    <input
      ref="folderInput"
      type="file"
      multiple
      webkitdirectory
      class="sr-only"
      @change="onInputChange"
    />

    <div
      class="rounded-md border border-dashed px-3 py-4 text-center text-xs text-slate-400"
      :class="isDragging ? 'border-slate-400' : 'border-slate-700'"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
    >
      {{ t('batch.drop') }}
    </div>

    <div class="mt-3 flex flex-wrap items-end gap-3">
      <BaseButton size="sm" @click="fileInput?.click()">{{ t('batch.addFiles') }}</BaseButton>
      <BaseButton size="sm" @click="folderInput?.click()">{{ t('batch.addFolder') }}</BaseButton>
      <BaseField :label="t('batch.concurrency')">
        <BaseNumberInput v-model="concurrency" :min="MIN_CONCURRENCY" :max="MAX_CONCURRENCY" />
      </BaseField>
      <BaseField :label="t('batch.conflicts')">
        <BaseSelect v-model="conflictPolicy" :options="conflictOptions" />
      </BaseField>
      <label class="flex items-center gap-1 text-xs text-slate-300">
        <input v-model="keepStructure" type="checkbox" />
        {{ t('batch.keepStructure') }}
      </label>
      <label class="flex items-center gap-1 text-xs text-slate-300">
        <input v-model="skipDuplicates" type="checkbox" />
        {{ t('batch.skipDuplicates') }}
      </label>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <BaseButton v-if="isPaused" variant="primary" size="sm" @click="store.start()">
        {{ t('batch.start') }}
      </BaseButton>
      <BaseButton v-else size="sm" @click="store.pause()">{{ t('batch.pause') }}</BaseButton>
      <BaseButton
        size="sm"
        :disabled="summary.pending + summary.running === 0"
        @click="store.cancelAll()"
      >
        {{ t('batch.cancelAll') }}
      </BaseButton>
      <BaseButton
        size="sm"
        :disabled="summary.failed + summary.cancelled === 0"
        @click="store.retryFailed()"
      >
        {{ t('batch.retryFailed') }}
      </BaseButton>
      <BaseButton size="sm" :disabled="total === 0" @click="store.clearFinished()">
        {{ t('batch.clearFinished') }}
      </BaseButton>
      <BaseButton
        size="sm"
        :disabled="!hasOutputs || isPackaging || isActive"
        @click="store.downloadArchive()"
      >
        {{ t('batch.download') }}
      </BaseButton>
      <BaseButton size="sm" :disabled="!lastReport" @click="store.downloadReport()">
        {{ t('batch.report') }}
      </BaseButton>
    </div>

    <p class="mt-3 text-xs text-slate-400">
      {{
        total === 0
          ? t('batch.empty')
          : t('batch.summary', {
              total,
              done: summary.done + summary.done_with_warnings,
              failed: summary.failed,
              pending: summary.pending + summary.running,
            })
      }}
    </p>

    <table v-if="total > 0" class="mt-2 w-full text-left text-xs text-slate-300">
      <thead class="text-slate-400">
        <tr>
          <th class="py-1 font-normal">{{ t('batch.file') }}</th>
          <th class="py-1 font-normal">{{ t('batch.stateColumn') }}</th>
          <th class="py-1 font-normal">{{ t('batch.outputs') }}</th>
          <th class="py-1 font-normal">{{ t('batch.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="job in jobs" :key="job.id" class="border-t border-slate-800 align-top">
          <td class="py-1 pr-2 break-all">{{ job.input.relativePath }}</td>
          <td class="py-1 pr-2">
            {{ t(`batch.state.${job.state}`) }}
            <span v-if="job.duplicateOf">
              · {{ t('batch.duplicateOf', { id: job.duplicateOf }) }}</span
            >
            <span v-if="job.error"> · {{ job.error }}</span>
            <span v-if="job.warnings.length > 0"> · {{ job.warnings.join('; ') }}</span>
          </td>
          <td class="py-1 pr-2">
            {{ job.outputs.map((output) => output.fileName).join(', ') || '—' }}
          </td>
          <td class="py-1">
            <span class="flex flex-wrap gap-1">
              <BaseButton
                v-if="job.state === 'pending' || job.state === 'running'"
                size="sm"
                @click="store.cancel(job.id)"
              >
                {{ t('batch.cancel') }}
              </BaseButton>
              <BaseButton
                v-if="
                  job.state === 'failed' || job.state === 'cancelled' || job.state === 'skipped'
                "
                size="sm"
                @click="store.retry(job.id)"
              >
                {{ t('batch.retry') }}
              </BaseButton>
              <BaseButton v-if="job.state === 'pending'" size="sm" @click="store.move(job.id, -1)">
                {{ t('sets.up') }}
              </BaseButton>
              <BaseButton v-if="job.state === 'pending'" size="sm" @click="store.move(job.id, 1)">
                {{ t('sets.down') }}
              </BaseButton>
              <BaseButton v-if="job.state !== 'running'" size="sm" @click="store.remove(job.id)">
                {{ t('sets.remove') }}
              </BaseButton>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </BasePanel>
</template>
