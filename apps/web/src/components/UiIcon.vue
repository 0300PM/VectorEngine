<script setup lang="ts">
import type { IconName } from '@/ui/icons'

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
  undo: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  redo: ['M15 14l4-5-4-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
  eye: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  'eye-off': ['M4 4l16 16', 'M9.6 9.7a3 3 0 0 0 4 4', 'M6.4 6.5C4 8 2 12 2 12s3.5 7 10 7c1.5 0 2.8-.4 4-1'],
  layers: ['M12 3 21 8l-9 5-9-5z', 'M3 12l9 5 9-5', 'M3 16l9 5 9-5'],
  rect: ['M5 6h14v12H5z'],
  circle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18'],
  ellipse: ['M4 12a8 5 0 1 0 16 0 8 5 0 1 0-16 0'],
  line: ['M5 19 19 5'],
  polygon: ['M12 3 21 9v6l-9 6-9-6V9z'],
  polyline: ['M4 17l6-6 4 4 6-8'],
  path: ['M4 18c4-12 12-12 16 0'],
  text: ['M5 5h14', 'M12 5v14', 'M9 19h6'],
  group: ['M4 5h16v14H4z', 'M4 10h16'],
  cursor: ['M5 3l5.5 14 2.2-6.3L18.5 10z'],
  pen: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  arc: ['M5 19a14 14 0 0 1 14 0', 'M2 19h20'],
  star: ['M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.8l6-.8z'],
  union: ['M9 20a6 6 0 1 0 0-12 6 6 0 0 0 0 12', 'M15 20a6 6 0 1 0 0-12 6 6 0 0 0 0 12'],
  subtract: ['M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16', 'M8.5 15.5l7-7'],
  intersect: ['M12 4a7.5 7.5 0 0 1 0 13', 'M12 4a7.5 7.5 0 0 0 0 13'],
  exclude: [
    'M7 20a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
    'M17 20a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
    'M12 4v16',
  ],
  link: ['M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1', 'M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h1'],
  unlink: ['M9 12a3 3 0 0 1 3-3h3', 'M15 12a3 3 0 0 1-3 3H9', 'M5 5l4 4', 'M19 19l-4-4'],
  reverse: ['M4 8h13l-3-3', 'M20 16H7l3 3'],
  simplify: ['M4 20l5-14 4 8 3-5 4 11'],
  nodes: ['M5 4v5', 'M5 9h14', 'M19 4v5', 'M12 13v7', 'M12 20h.01'],
  corner: ['M5 19l6-14 7 10 4-6'],
  smooth: ['M4 20c5-14 11-14 16 0'],
  symmetric: ['M12 3v18', 'M7.5 8C4.5 11 4.5 13 7.5 16', 'M16.5 8c3 3 3 5 0 8'],
  hand: ['M7 11V5.5a1.5 1.5 0 0 1 3 0V11', 'M10 11V4.5a1.5 1.5 0 0 1 3 0V11', 'M13 11V6a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3l-2-4a1.5 1.5 0 0 1 2.5-1.6L7 13'],
  grid: ['M4 4h16v16H4z', 'M4 10h16', 'M4 16h16', 'M10 4v16', 'M16 4v16'],
  ruler: ['M3 8h18v8H3z', 'M7 8v3', 'M11 8v4', 'M15 8v3', 'M19 8v4'],
  snap: ['M5 4v9a7 7 0 0 0 14 0V4', 'M5 4h4v9a3 3 0 0 0 6 0V4h4', 'M10 16v5', 'M14 16v5'],
  expand: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  compress: ['M9 4v5H4', 'M15 4v5h5', 'M9 20v-5H4', 'M15 20v-5h5'],
  'align-left': ['M4 3v18', 'M8 7h9', 'M8 12h6', 'M8 17h9'],
  'align-center-h': ['M12 3v18', 'M7 7h10', 'M9 12h6', 'M7 17h10'],
  'align-right': ['M20 3v18', 'M7 7h9', 'M11 12h6', 'M7 17h9'],
  'align-top': ['M3 4h18', 'M7 8v9', 'M12 8v6', 'M17 8v9'],
  'align-center-v': ['M3 12h18', 'M7 7v10', 'M12 9v6', 'M17 7v10'],
  'align-bottom': ['M3 20h18', 'M7 7v9', 'M12 10v6', 'M17 7v9'],
  'distribute-h': ['M3 4v16', 'M21 4v16', 'M7 8h10', 'M10 16h4'],
  'distribute-v': ['M4 3h16', 'M4 21h16', 'M8 7v10', 'M16 10v4'],
  'match-width': ['M4 9V7h16v2', 'M4 9v8h16V9', 'M9 13h6'],
  'match-height': ['M8 4v16h2V4', 'M14 9h4v6h-4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
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
