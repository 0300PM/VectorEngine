<script setup lang="ts">
type IconName =
  | 'upload'
  | 'reset'
  | 'download'
  | 'format'
  | 'minus'
  | 'plus'
  | 'fit'
  | 'lock'
  | 'unlock'
  | 'check'
  | 'alert'
  | 'info'
  | 'spinner'
  | 'code'
  | 'preview'
  | 'export'
  | 'chevron'
  | 'close'

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 16 })

const paths: Record<IconName, string[]> = {
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M5 20h14'],
  reset: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v6h6'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  format: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
  minus: ['M5 12h14'],
  plus: ['M12 5v14', 'M5 12h14'],
  fit: ['M8 3H3v5', 'M16 3h5v5', 'M8 21H3v-5', 'M16 21h5v-5'],
  lock: ['M6 10h12v11H6z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  unlock: ['M6 10h12v11H6z', 'M8 10V7a4 4 0 0 1 7.5-2'],
  check: ['m5 12 4 4L19 6'],
  alert: ['M12 3 2.8 20h18.4z', 'M12 9v4', 'M12 17h.01'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20', 'M12 11v6', 'M12 7h.01'],
  spinner: ['M21 12a9 9 0 1 1-6.2-8.6'],
  code: ['m8 9-4 3 4 3', 'm16 9 4 3-4 3', 'm14 5-4 14'],
  preview: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  export: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  chevron: ['m9 18 6-6-6-6'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
}
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="path in paths[props.name]" :key="path" :d="path" />
  </svg>
</template>
