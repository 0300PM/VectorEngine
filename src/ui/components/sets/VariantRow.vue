<script setup lang="ts">
import { computed } from 'vue'
import {
  MAX_VARIANT_PADDING,
  backgroundModes,
  exportFormats,
  variantSizeModes,
  type BackgroundMode,
  type ExportFormat,
  type ExportVariant,
  type VariantBackground,
  type VariantSize,
  type VariantSizeMode,
} from '@/formats'
import { useMessages } from '@/i18n'
import BaseButton from '../base/BaseButton.vue'
import BaseField from '../base/BaseField.vue'
import BaseNumberInput from '../base/BaseNumberInput.vue'
import BaseSelect, { type SelectOption } from '../base/BaseSelect.vue'
import BaseTextInput from '../base/BaseTextInput.vue'

const { variant } = defineProps<{ variant: ExportVariant }>()

const emit = defineEmits<{
  update: [patch: Partial<ExportVariant>]
  move: [offset: number]
  remove: []
}>()

const { t } = useMessages()

const formatOptions: SelectOption<ExportFormat>[] = exportFormats.map((value) => ({
  value,
  label: value.toUpperCase(),
}))

const sizeModeOptions = computed<SelectOption<VariantSizeMode>[]>(() =>
  variantSizeModes
    .filter((mode) => (variant.format === 'ico' ? mode === 'sizes' : mode !== 'sizes'))
    .map((mode) => ({
      value: mode,
      label: t(
        mode === 'original'
          ? 'sets.sizeOriginal'
          : mode === 'scale'
            ? 'sets.sizeScale'
            : mode === 'fixed'
              ? 'sets.sizeFixed'
              : 'sets.sizeSizes',
      ),
    })),
)

const backgroundOptions = computed<SelectOption<BackgroundMode>[]>(() =>
  backgroundModes.map((mode) => ({
    value: mode,
    label: t(
      mode === 'document'
        ? 'sets.backgroundDocument'
        : mode === 'transparent'
          ? 'sets.backgroundTransparent'
          : 'sets.backgroundColor',
    ),
  })),
)

const format = computed({
  get: () => variant.format,
  set: (value: ExportFormat) => emit('update', { format: value }),
})

const sizeMode = computed({
  get: () => variant.size.mode,
  set: (mode: VariantSizeMode) => emit('update', { size: defaultSize(mode) }),
})

const defaultSize = (mode: VariantSizeMode): VariantSize => {
  switch (mode) {
    case 'original':
      return { mode }
    case 'scale':
      return { mode, factor: 2 }
    case 'fixed':
      return { mode, width: 512, height: 512 }
    case 'sizes':
      return { mode, sizes: [16, 32, 48] }
  }
}

const factor = computed({
  get: () => (variant.size.mode === 'scale' ? variant.size.factor : 1),
  set: (value: number) => emit('update', { size: { mode: 'scale', factor: value } }),
})

const width = computed({
  get: () => (variant.size.mode === 'fixed' ? variant.size.width : 0),
  set: (value: number) =>
    emit('update', {
      size: {
        mode: 'fixed',
        width: value,
        height: variant.size.mode === 'fixed' ? variant.size.height : value,
      },
    }),
})

const height = computed({
  get: () => (variant.size.mode === 'fixed' ? variant.size.height : 0),
  set: (value: number) =>
    emit('update', {
      size: {
        mode: 'fixed',
        width: variant.size.mode === 'fixed' ? variant.size.width : value,
        height: value,
      },
    }),
})

const sizes = computed({
  get: () => (variant.size.mode === 'sizes' ? variant.size.sizes.join(', ') : ''),
  set: (value: string) =>
    emit('update', {
      size: {
        mode: 'sizes',
        sizes: value
          .split(/[\s,;]+/)
          .map(Number)
          .filter((size) => Number.isInteger(size) && size > 0),
      },
    }),
})

const backgroundMode = computed({
  get: () => variant.background.mode,
  set: (mode: BackgroundMode) => {
    const background: VariantBackground = mode === 'color' ? { mode, color: '#ffffff' } : { mode }
    emit('update', { background })
  },
})

const backgroundColor = computed({
  get: () => (variant.background.mode === 'color' ? variant.background.color : ''),
  set: (color: string) => emit('update', { background: { mode: 'color', color } }),
})

const padding = computed({
  get: () => variant.padding,
  set: (value: number) =>
    emit('update', { padding: Math.min(MAX_VARIANT_PADDING, Math.max(0, value)) }),
})

const suffix = computed({
  get: () => variant.suffix,
  set: (value: string) => emit('update', { suffix: value }),
})

const fileName = computed({
  get: () => variant.fileName ?? '',
  set: (value: string) => emit('update', { fileName: value.trim() || undefined }),
})

const quality = computed({
  get: () => variant.quality,
  set: (value: number) => emit('update', { quality: Math.min(1, Math.max(0.1, value)) }),
})

const recolor = computed({
  get: () => variant.recolor ?? '',
  set: (value: string) => emit('update', { recolor: value.trim() || undefined }),
})

const supportsQuality = computed(() => variant.format === 'jpeg' || variant.format === 'webp')
</script>

<template>
  <li class="flex flex-wrap items-end gap-2 border-b border-slate-800 pb-2">
    <BaseField :label="t('sets.format')">
      <BaseSelect v-model="format" :options="formatOptions" />
    </BaseField>
    <BaseField :label="t('sets.size')">
      <BaseSelect v-model="sizeMode" :options="sizeModeOptions" />
    </BaseField>
    <BaseField v-if="variant.size.mode === 'scale'" :label="t('sets.factor')">
      <BaseNumberInput v-model="factor" :min="0.1" :step="0.5" />
    </BaseField>
    <template v-if="variant.size.mode === 'fixed'">
      <BaseField :label="t('sets.width')">
        <BaseNumberInput v-model="width" :min="1" />
      </BaseField>
      <BaseField :label="t('sets.height')">
        <BaseNumberInput v-model="height" :min="1" />
      </BaseField>
    </template>
    <BaseField v-if="variant.size.mode === 'sizes'" :label="t('sets.icoSizes')">
      <BaseTextInput v-model.lazy="sizes" />
    </BaseField>
    <BaseField :label="t('sets.background')">
      <BaseSelect v-model="backgroundMode" :options="backgroundOptions" />
    </BaseField>
    <BaseField v-if="variant.background.mode === 'color'" :label="t('sets.backgroundColor')">
      <BaseTextInput v-model.lazy="backgroundColor" />
    </BaseField>
    <BaseField :label="t('sets.padding')">
      <BaseNumberInput v-model="padding" :min="0" :max="MAX_VARIANT_PADDING" :step="0.05" />
    </BaseField>
    <BaseField :label="t('sets.suffix')">
      <BaseTextInput v-model.lazy="suffix" />
    </BaseField>
    <BaseField :label="t('sets.fileName')">
      <BaseTextInput v-model.lazy="fileName" />
    </BaseField>
    <BaseField v-if="supportsQuality" :label="t('sets.quality')">
      <BaseNumberInput v-model="quality" :min="0.1" :max="1" :step="0.05" />
    </BaseField>
    <BaseField :label="t('sets.recolor')">
      <BaseTextInput v-model.lazy="recolor" />
    </BaseField>
    <span class="flex gap-1">
      <BaseButton size="sm" @click="emit('move', -1)">{{ t('sets.up') }}</BaseButton>
      <BaseButton size="sm" @click="emit('move', 1)">{{ t('sets.down') }}</BaseButton>
      <BaseButton size="sm" @click="emit('remove')">{{ t('sets.remove') }}</BaseButton>
    </span>
  </li>
</template>
