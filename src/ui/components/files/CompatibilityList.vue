<script setup lang="ts">
import { computed } from 'vue'
import type { CompatibilityIssue, CompatibilityReport, IssueSeverity, Verdict } from '@/formats'
import { useMessages } from '@/i18n'

const { report } = defineProps<{ report: CompatibilityReport }>()

const { t } = useMessages()

const verdictClasses: Record<Verdict, string> = {
  faithful: 'bg-emerald-900/60 text-emerald-200 ring-emerald-700',
  lossy: 'bg-amber-900/60 text-amber-200 ring-amber-700',
  blocked: 'bg-rose-900/60 text-rose-200 ring-rose-700',
}

const severityClasses: Record<IssueSeverity, string> = {
  info: 'text-sky-300',
  warning: 'text-amber-300',
  error: 'text-rose-300',
  critical: 'text-rose-200 font-semibold',
}

const MAX_SUBJECTS = 4

const subjects = (issue: CompatibilityIssue): string => {
  const shown = issue.subjects.slice(0, MAX_SUBJECTS).join(', ')
  return issue.subjects.length > MAX_SUBJECTS
    ? `${shown} (+${issue.subjects.length - MAX_SUBJECTS})`
    : shown
}

const remedies = (issue: CompatibilityIssue): string =>
  issue.remedies.map((remedy) => t(`compat.remedy.${remedy}`)).join(', ')

const sorted = computed(() => {
  const order: Record<IssueSeverity, number> = { critical: 0, error: 1, warning: 2, info: 3 }
  return [...report.issues].sort((left, right) => order[left.severity] - order[right.severity])
})
</script>

<template>
  <section class="space-y-2 text-xs">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium text-slate-300">{{ t('compat.title') }}</span>
      <span class="rounded-full px-2 py-0.5 ring-1" :class="verdictClasses[report.verdict]">
        {{ t(`compat.verdict.${report.verdict}`) }}
      </span>
      <span class="text-slate-500">{{ report.targetLabel }}</span>
    </div>
    <p v-if="sorted.length === 0" class="text-slate-400">
      {{ t('compat.empty', { format: report.targetLabel }) }}
    </p>
    <ul v-else class="space-y-1.5">
      <li
        v-for="issue in sorted"
        :key="`${issue.feature}-${issue.support}`"
        class="rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-1.5"
      >
        <div class="flex flex-wrap items-baseline gap-x-2">
          <span :class="severityClasses[issue.severity]">
            {{ t(`compat.severity.${issue.severity}`) }}
          </span>
          <span class="text-slate-200">
            {{
              t('compat.issue', {
                feature: t(`compat.feature.${issue.feature}`),
                support: t(`compat.support.${issue.support}`),
              })
            }}
          </span>
          <span v-if="issue.count > 0" class="text-slate-500">
            {{ t('compat.affected', { count: issue.count }, issue.count) }}
          </span>
        </div>
        <p v-if="issue.detail" class="text-slate-400">{{ issue.detail }}</p>
        <p
          v-if="issue.subjects.length > 0"
          class="truncate text-slate-500"
          :title="issue.subjects.join(', ')"
        >
          {{ subjects(issue) }}
        </p>
        <p v-if="issue.remedies.length > 0" class="text-slate-400">
          {{ t('compat.remedies', { list: remedies(issue) }) }}
        </p>
      </li>
    </ul>
  </section>
</template>
