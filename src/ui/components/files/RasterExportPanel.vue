<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { scalePresets, sizeModes, useExportStore, type SizeMode } from '@/app/stores'
import {
  MAX_QUALITY,
  MIN_QUALITY,
  rasterFormatInfo,
  rasterFormats,
  type RasterFormat,
} from '@/formats'
import { useMessages } from '@/i18n'
import BaseButton from '../base/BaseButton.vue'
import BaseField from '../base/BaseField.vue'
import BaseNumberInput from '../base/BaseNumberInput.vue'
import BasePanel from '../base/BasePanel.vue'
import BaseSelect, { type SelectOption } from '../base/BaseSelect.vue'
import CompatibilityList from './CompatibilityList.vue'
import ConversionSummary from './ConversionSummary.vue'

const { t } = useMessages()
const exportStore = useExportStore()
const {
  sizeMode,
  scale,
  customWidth,
  customHeight,
  format,
  quality,
  isExporting,
  targetSize,
  compatibility,
  isBlocked,
  lastReport,
} = storeToRefs(exportStore)

const sizeModeOptions = computed<SelectOption<SizeMode>[]>(() =>
  sizeModes.map((mode) => ({
    value: mode,
    label: mode === 'scale' ? t('export.scaleMode') : t('export.customMode'),
  })),
)

const scaleOptions: SelectOption<number>[] = scalePresets.map((preset) => ({
  value: preset,
  label: `${preset}×`,
}))

const formatOptions: SelectOption<RasterFormat>[] = rasterFormats.map((value) => ({
  value,
  label: value.toUpperCase(),
}))

const supportsQuality = computed(() => rasterFormatInfo[format.value].supportsQuality)
</script>

<template>
  <BasePanel :title="t('export.title')">
    <div class="flex flex-wrap items-end gap-3">
      <BaseField :label="t('export.sizeMode')">
        <BaseSelect v-model="sizeMode" :options="sizeModeOptions" />
      </BaseField>

      <BaseField v-if="sizeMode === 'scale'" :label="t('export.scale')">
        <BaseSelect v-model="scale" :options="scaleOptions" />
      </BaseField>
      <template v-else>
        <BaseField :label="t('export.width')">
          <BaseNumberInput v-model="customWidth" :min="1" />
        </BaseField>
        <BaseField :label="t('export.height')">
          <BaseNumberInput v-model="customHeight" :min="1" />
        </BaseField>
      </template>

      <BaseField :label="t('export.format')">
        <BaseSelect v-model="format" :options="formatOptions" />
      </BaseField>

      <BaseField :label="`${t('export.quality')} (${quality.toFixed(2)})`">
        <input
          v-model.number="quality"
          type="range"
          :min="MIN_QUALITY"
          :max="MAX_QUALITY"
          step="0.01"
          :disabled="!supportsQuality"
          class="mt-2 block w-36 accent-blue-500 disabled:opacity-40"
        />
      </BaseField>
    </div>

    <p class="mt-3 text-xs" :class="targetSize ? 'text-slate-400' : 'text-rose-300'">
      {{ targetSize ? t('export.output', targetSize) : t('status.invalidSize') }}
    </p>

    <div class="mt-3">
      <CompatibilityList :report="compatibility" />
    </div>

    <p v-if="isBlocked" class="mt-2 text-xs text-rose-300">{{ t('files.blocked') }}</p>

    <div class="mt-4 flex flex-wrap gap-3">
      <BaseButton
        variant="success"
        :disabled="isExporting || !targetSize || isBlocked"
        @click="exportStore.exportRaster()"
      >
        {{ t('export.run', { format: format.toUpperCase() }) }}
      </BaseButton>
      <BaseButton
        :disabled="isExporting || !targetSize || isBlocked"
        @click="exportStore.exportAllRasters()"
      >
        {{ t('export.runAll') }}
      </BaseButton>
    </div>

    <ConversionSummary
      v-if="lastReport"
      class="mt-4"
      :report="lastReport"
      @download="exportStore.downloadReport()"
    />
  </BasePanel>
</template>
