<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useDocumentStore, useRenderStore } from '@/app/stores'
import { useMessages } from '@/i18n'
import BasePanel from '../base/BasePanel.vue'

const { t } = useMessages()
const documentStore = useDocumentStore()
const renderStore = useRenderStore()
const { issues, importReport } = storeToRefs(documentStore)
const { unsupported } = storeToRefs(renderStore)
</script>

<template>
  <BasePanel :title="t('issues.title')">
    <p v-if="issues.length === 0" class="text-xs text-emerald-300">{{ t('issues.valid') }}</p>
    <ul v-else class="space-y-1.5 text-xs">
      <li v-for="(issue, index) in issues" :key="`${issue.path}-${index}`" class="flex gap-2">
        <code class="shrink-0 rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-200">
          {{ issue.path || t('issues.atRoot') }}
        </code>
        <span class="text-slate-300">
          {{ issue.reason ? t(`issues.reason.${issue.reason}`) : issue.message }}
        </span>
      </li>
    </ul>

    <section v-if="unsupported.length > 0" class="mt-4">
      <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
        {{ t('issues.unsupportedTitle') }}
      </h3>
      <ul class="space-y-1 text-xs text-slate-300">
        <li v-for="item in unsupported" :key="`${item.nodeId}-${item.feature}`">
          {{ t(`issues.unsupported.${item.feature}`, { id: item.nodeId }) }}
        </li>
      </ul>
    </section>

    <section v-if="importReport" class="mt-4">
      <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sky-300">
        {{ t('warnings.title') }}
      </h3>
      <p class="text-xs text-slate-400">
        {{
          t('warnings.source', {
            fileName: importReport.fileName,
            format: importReport.formatLabel,
          })
        }}
      </p>
      <ul v-if="importReport.warnings.length > 0" class="mt-1 space-y-1 text-xs text-slate-300">
        <li v-for="warning in importReport.warnings" :key="warning.code">
          {{ t(`warnings.${warning.code}`, { detail: warning.detail ?? '' }) }}
        </li>
      </ul>
    </section>
  </BasePanel>
</template>
