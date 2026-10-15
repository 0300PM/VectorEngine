<script setup lang="ts">
import type { ConversionReport } from '@/formats'
import { useMessages } from '@/i18n'
import BaseButton from '../base/BaseButton.vue'

const { report } = defineProps<{ report: ConversionReport }>()

const emit = defineEmits<{ download: [] }>()

const { t } = useMessages()

const validationClasses: Record<ConversionReport['validation'], string> = {
  passed: 'text-emerald-300',
  failed: 'text-rose-300',
  not_verified: 'text-slate-400',
}
</script>

<template>
  <section class="space-y-2 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="font-medium text-slate-300">{{ t('compat.report.title') }}</span>
      <BaseButton size="sm" variant="ghost" @click="emit('download')">
        {{ t('compat.report.download') }}
      </BaseButton>
    </div>
    <p class="text-slate-300">
      {{
        t('compat.report.summary', {
          fileName: report.fileName,
          format: report.targetFormat.toUpperCase(),
          processed: report.processedObjects,
          skipped: report.skippedObjects,
          warnings: report.warningCount,
        })
      }}
    </p>
    <p :class="validationClasses[report.validation]">
      {{
        t('compat.report.validation', {
          status: t(`compat.report.validationStatus.${report.validation}`),
        })
      }}
    </p>
    <div v-if="report.transformations.length > 0">
      <p class="text-slate-400">{{ t('compat.report.transformations') }}</p>
      <ul class="mt-1 list-disc space-y-0.5 pl-4 text-slate-400">
        <li v-for="transformation in report.transformations" :key="transformation.kind">
          {{
            t(`compat.transformation.${transformation.kind}`, {
              detail: transformation.detail ?? '',
            })
          }}
        </li>
      </ul>
    </div>
  </section>
</template>
