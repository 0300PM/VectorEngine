<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { scopeKinds, useExportSetStore, type ScopeKind } from '@/app/stores'
import { describeSize, type PlanProblem } from '@/formats'
import { useMessages } from '@/i18n'
import BaseButton from '../base/BaseButton.vue'
import BaseField from '../base/BaseField.vue'
import BaseNumberInput from '../base/BaseNumberInput.vue'
import BasePanel from '../base/BasePanel.vue'
import BaseSelect, { type SelectOption } from '../base/BaseSelect.vue'
import BaseTextInput from '../base/BaseTextInput.vue'
import VariantRow from './VariantRow.vue'

const { t, locale } = useMessages()
const store = useExportSetStore()
const {
  presets,
  selectedPresetId,
  selectedPreset,
  variants,
  scopeKind,
  scopeNodeIds,
  scopePadding,
  nodeOptions,
  plan,
  isRunning,
  lastResult,
  history,
} = storeToRefs(store)

const presetName = ref('')

const presetOptions = computed<SelectOption<string>[]>(() =>
  presets.value.map((preset) => ({ value: preset.id, label: preset.name })),
)

const scopeOptions = computed<SelectOption<ScopeKind>[]>(() =>
  scopeKinds.map((kind) => ({
    value: kind,
    label: t(kind === 'document' ? 'sets.scopeDocument' : 'sets.scopeNodes'),
  })),
)

const selectedPresetValue = computed({
  get: () => selectedPresetId.value,
  set: (id: string) => store.selectPreset(id),
})

const variantById = (id: string) => variants.value.find((variant) => variant.id === id)

const describeOutputSize = (variantId: string): string => {
  const variant = variantById(variantId)
  return variant ? describeSize(variant.size) : ''
}

const problemLabel = (problem: PlanProblem): string => t(`sets.problem.${problem}`)

const onNodesChange = (event: Event): void => {
  const select = event.target as HTMLSelectElement
  scopeNodeIds.value = Array.from(select.selectedOptions, (option) => option.value)
}

const savePreset = (): void => {
  store.savePreset(presetName.value)
  presetName.value = ''
}
</script>

<template>
  <BasePanel :title="t('sets.title')">
    <div class="flex flex-wrap items-end gap-3">
      <BaseField :label="t('sets.preset')">
        <BaseSelect v-model="selectedPresetValue" :options="presetOptions" />
      </BaseField>
      <BaseButton
        v-if="selectedPreset && !selectedPreset.builtIn"
        size="sm"
        @click="store.deletePreset(selectedPreset.id)"
      >
        {{ t('sets.deletePreset') }}
      </BaseButton>
      <BaseField :label="t('sets.presetName')">
        <BaseTextInput v-model="presetName" />
      </BaseField>
      <BaseButton size="sm" :disabled="!presetName.trim()" @click="savePreset">
        {{ t('sets.savePreset') }}
      </BaseButton>
    </div>

    <div class="mt-3 flex flex-wrap items-end gap-3">
      <BaseField :label="t('sets.scope')">
        <BaseSelect v-model="scopeKind" :options="scopeOptions" />
      </BaseField>
      <template v-if="scopeKind === 'nodes'">
        <BaseField :label="t('sets.nodes')">
          <select
            multiple
            class="block h-24 min-w-48 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            @change="onNodesChange"
          >
            <option
              v-for="option in nodeOptions"
              :key="option.value"
              :value="option.value"
              :selected="scopeNodeIds.includes(option.value)"
            >
              {{ option.label }}
            </option>
          </select>
        </BaseField>
        <BaseField :label="t('sets.scopePadding')">
          <BaseNumberInput v-model="scopePadding" :min="0" :max="1" :step="0.05" />
        </BaseField>
      </template>
    </div>

    <h3 class="mt-4 text-xs font-medium text-slate-300">{{ t('sets.variants') }}</h3>
    <ul v-if="variants.length > 0" class="mt-2 space-y-2">
      <VariantRow
        v-for="variant in variants"
        :key="variant.id"
        :variant="variant"
        @update="(patch) => store.updateVariant(variant.id, patch)"
        @move="(offset) => store.moveVariant(variant.id, offset)"
        @remove="store.removeVariant(variant.id)"
      />
    </ul>
    <p v-else class="mt-2 text-xs text-slate-400">{{ t('sets.empty') }}</p>
    <BaseButton size="sm" class="mt-2" @click="store.addVariant()">
      {{ t('sets.addVariant') }}
    </BaseButton>

    <h3 class="mt-4 text-xs font-medium text-slate-300">{{ t('sets.plan') }}</h3>
    <table class="mt-2 w-full text-left text-xs text-slate-300">
      <thead class="text-slate-400">
        <tr>
          <th class="py-1 font-normal">{{ t('sets.planFile') }}</th>
          <th class="py-1 font-normal">{{ t('sets.planSize') }}</th>
          <th class="py-1 font-normal">{{ t('sets.planVerdict') }}</th>
          <th class="py-1 font-normal">{{ t('sets.planProblems') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="output in plan.outputs"
          :key="output.variantId"
          class="border-t border-slate-800"
        >
          <td class="py-1 pr-2">{{ output.fileName }}</td>
          <td class="py-1 pr-2">
            {{
              output.pixelSize
                ? `${output.pixelSize.width} × ${output.pixelSize.height} px`
                : output.sizes
                  ? `${output.sizes.join('/')} px`
                  : describeOutputSize(output.variantId)
            }}
          </td>
          <td class="py-1 pr-2">
            {{ output.compatibility ? t(`compat.verdict.${output.compatibility.verdict}`) : '—' }}
          </td>
          <td class="py-1">{{ output.problems.map(problemLabel).join(', ') || '—' }}</td>
        </tr>
      </tbody>
    </table>

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <BaseButton variant="primary" :disabled="!plan.ok || isRunning" @click="store.runExport()">
        {{ isRunning ? t('sets.running') : t('sets.run') }}
      </BaseButton>
      <BaseButton size="sm" :disabled="!lastResult" @click="store.downloadReport()">
        {{ t('sets.report') }}
      </BaseButton>
    </div>

    <template v-if="history.length > 0">
      <h3 class="mt-4 text-xs font-medium text-slate-300">{{ t('sets.history') }}</h3>
      <ul class="mt-1 space-y-0.5 text-xs text-slate-400">
        <li v-for="entry in history" :key="entry.at">
          {{
            t('sets.historyEntry', {
              at: new Date(entry.at).toLocaleString(locale),
              preset: entry.preset,
              files: entry.files,
              failures: entry.failures,
            })
          }}
        </li>
      </ul>
    </template>
  </BasePanel>
</template>
