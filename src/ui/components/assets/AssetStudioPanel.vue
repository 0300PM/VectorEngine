<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { assetKinds, useAssetStudioStore, type AssetKind } from '@/app/stores'
import { MAX_VARIANT_PADDING, backgroundModes, type BackgroundMode } from '@/formats'
import { useMessages } from '@/i18n'
import BaseButton from '../base/BaseButton.vue'
import BaseField from '../base/BaseField.vue'
import BaseNumberInput from '../base/BaseNumberInput.vue'
import BasePanel from '../base/BasePanel.vue'
import BaseSelect, { type SelectOption } from '../base/BaseSelect.vue'
import BaseTextInput from '../base/BaseTextInput.vue'

const { t } = useMessages()
const store = useAssetStudioStore()
const {
  kind,
  appName,
  themeColor,
  backgroundMode,
  backgroundColor,
  padding,
  includeSvg,
  monochrome,
  monochromeColor,
  dark,
  darkBackground,
  isRunning,
  lastResult,
  html,
} = storeToRefs(store)

const kindOptions = computed<SelectOption<AssetKind>[]>(() =>
  assetKinds.map((value) => ({
    value,
    label: t(value === 'favicon' ? 'assets.favicon' : 'assets.appIcons'),
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
</script>

<template>
  <BasePanel :title="t('assets.title')">
    <div class="flex flex-wrap items-end gap-3">
      <BaseField :label="t('assets.kind')">
        <BaseSelect v-model="kind" :options="kindOptions" />
      </BaseField>
      <BaseField :label="t('assets.background')">
        <BaseSelect v-model="backgroundMode" :options="backgroundOptions" />
      </BaseField>
      <BaseField v-if="backgroundMode === 'color'" :label="t('sets.backgroundColor')">
        <BaseTextInput v-model.lazy="backgroundColor" />
      </BaseField>
      <BaseField :label="t('assets.padding')">
        <BaseNumberInput v-model="padding" :min="0" :max="MAX_VARIANT_PADDING" :step="0.05" />
      </BaseField>
    </div>

    <div v-if="kind === 'favicon'" class="mt-3 flex flex-wrap items-end gap-3">
      <BaseField :label="t('assets.appName')">
        <BaseTextInput v-model="appName" />
      </BaseField>
      <BaseField :label="t('assets.themeColor')">
        <BaseTextInput v-model.lazy="themeColor" />
      </BaseField>
      <label class="flex items-center gap-1 text-xs text-slate-300">
        <input v-model="includeSvg" type="checkbox" />
        {{ t('assets.includeSvg') }}
      </label>
    </div>

    <div v-else class="mt-3 flex flex-wrap items-end gap-3">
      <label class="flex items-center gap-1 text-xs text-slate-300">
        <input v-model="monochrome" type="checkbox" />
        {{ t('assets.monochrome') }}
      </label>
      <BaseField v-if="monochrome || dark" :label="t('assets.monochromeColor')">
        <BaseTextInput v-model.lazy="monochromeColor" />
      </BaseField>
      <label class="flex items-center gap-1 text-xs text-slate-300">
        <input v-model="dark" type="checkbox" />
        {{ t('assets.dark') }}
      </label>
      <BaseField v-if="dark" :label="t('assets.darkBackground')">
        <BaseTextInput v-model.lazy="darkBackground" />
      </BaseField>
    </div>

    <div class="mt-4">
      <BaseButton variant="primary" :disabled="isRunning" @click="store.run()">
        {{ isRunning ? t('assets.running') : t('assets.run') }}
      </BaseButton>
    </div>

    <div v-if="lastResult" class="mt-4 space-y-2 text-xs text-slate-300">
      <p>
        {{ t('assets.files') }}:
        {{ lastResult.files.map((file) => file.fileName).join(', ') }}
        <template v-if="lastResult.extras.length > 0">
          , {{ lastResult.extras.map((extra) => extra.fileName).join(', ') }}
        </template>
      </p>
      <p v-for="failure in lastResult.failures" :key="failure.variantId">
        {{ failure.fileName }}: {{ failure.message }}
      </p>
      <p v-if="lastResult.problems.length === 0 && lastResult.failures.length === 0">
        {{ t('assets.ok') }}
      </p>
      <ul v-else>
        <li v-for="problem in lastResult.problems" :key="`${problem.code}-${problem.detail ?? ''}`">
          {{ t(`assets.problem.${problem.code}`, { detail: problem.detail ?? '' }) }}
        </li>
      </ul>
      <template v-if="html">
        <p>{{ t('assets.html') }}</p>
        <pre class="overflow-x-auto rounded-md border border-slate-800 p-2 text-slate-400">{{
          html
        }}</pre>
      </template>
    </div>
  </BasePanel>
</template>
