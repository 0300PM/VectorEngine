<script setup lang="ts">
import { computed } from 'vue'
import { useStatusStore, type StatusTone } from '@/app/stores'
import { useMessages } from '@/i18n'

const status = useStatusStore()
const { t } = useMessages()

const toneClasses: Record<StatusTone, string> = {
  info: 'text-slate-400',
  success: 'text-emerald-300',
  warning: 'text-amber-300',
  error: 'text-rose-300',
}

const text = computed(() => {
  const { key, params } = status.message
  const resolved = Object.fromEntries(
    Object.entries(params ?? {}).map(([name, value]) => [
      name,
      typeof value === 'object' ? t(value.messageKey) : value,
    ]),
  )
  return t(key, resolved)
})
</script>

<template>
  <Transition
    mode="out-in"
    enter-active-class="transition duration-200"
    enter-from-class="-translate-y-1 opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="opacity-0"
  >
    <p :key="text" class="text-xs" :class="toneClasses[status.message.tone]" role="status">
      {{ text }}
    </p>
  </Transition>
</template>
