<script setup lang="ts">
import { computed } from 'vue'
import { useRenderStore } from '@/app/stores'
import { useMessages, type Locale } from '@/i18n'
import { useLocale } from '../composables/useLocale'
import BaseField from './base/BaseField.vue'
import BaseSelect, { type SelectOption } from './base/BaseSelect.vue'

const { t } = useMessages()
const { locale, locales, setLocale } = useLocale()
const renderStore = useRenderStore()

const localeOptions = computed<SelectOption<Locale>[]>(() =>
  locales.map((value) => ({ value, label: t(`locale.${value}`) })),
)

const engineLabel = computed(() =>
  renderStore.activeEngine
    ? t('engine.active', { engine: t(`engine.${renderStore.activeEngine}`) })
    : t('engine.inactive'),
)
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="max-w-3xl">
      <p class="text-xs uppercase tracking-[0.18em] text-blue-300">{{ t('app.subtitle') }}</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-white">{{ t('app.title') }}</h1>
      <p class="mt-2 text-sm text-slate-300">{{ t('app.description') }}</p>
    </div>
    <div class="flex flex-wrap items-end gap-4">
      <span
        class="rounded-full border px-3 py-1 text-xs"
        :class="
          renderStore.activeEngine === 'wasm'
            ? 'border-emerald-500/60 text-emerald-200'
            : 'border-slate-700 text-slate-300'
        "
      >
        {{ engineLabel }}
      </span>
      <BaseField :label="t('locale.label')">
        <BaseSelect
          :model-value="locale"
          :options="localeOptions"
          @update:model-value="setLocale"
        />
      </BaseField>
    </div>
  </header>
</template>
