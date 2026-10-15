import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { MessageKey } from '@/i18n'

export type StatusTone = 'info' | 'success' | 'warning' | 'error'

export type StatusParam = string | number | { readonly messageKey: MessageKey }

export type StatusMessage = {
  readonly key: MessageKey
  readonly params?: Readonly<Record<string, StatusParam>>
  readonly tone: StatusTone
}

export const useStatusStore = defineStore('status', () => {
  const message = ref<StatusMessage>({ key: 'status.ready', tone: 'info' })

  const report = (
    key: MessageKey,
    tone: StatusTone = 'info',
    params?: Readonly<Record<string, StatusParam>>,
  ): void => {
    message.value = { key, tone, ...(params ? { params } : {}) }
  }

  const describeError = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

  return { message, report, describeError }
})
