<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PathCommand } from '@/paths/editor'
import { midpoint, pointDistance, type HandleKind, type PathModel, type Point } from '@/paths/model'
import { closestSegmentT, moveHandle, moveNode, segmentPointAt } from '@/paths/ops'
import { serializePathModel } from '@/paths/parser'
import {
  createArcPath,
  createLinePath,
  createPolygonPath,
  createPolylinePath,
  createStarPath,
} from '@/paths/shapes'
import { getPathTool, type PathToolKind } from '@/paths/tools'

const props = defineProps<{
  model: PathModel
  width: number
  height: number
  scale: number
  tool: PathToolKind
  editing: boolean
}>()

const emit = defineEmits<{
  command: [command: PathCommand]
  create: [model: PathModel, name: string]
  select: [subpath: number, node: number]
  cancel: []
}>()

interface HitTarget {
  kind: 'node' | 'handle' | 'segment'
  subpath: number
  node: number
  handle?: HandleKind
  t?: number
}

interface DragState {
  kind: 'node' | 'handle'
  subpath: number
  node: number
  handle: HandleKind
}

const svg = ref<SVGSVGElement | null>(null)
const cursor = ref<Point | null>(null)
const draftPoints = ref<Point[]>([])
const dragStart = ref<Point | null>(null)
const dragState = ref<DragState | null>(null)
const dragModel = ref<PathModel | null>(null)

const active = computed(() => props.tool !== 'select' || props.editing)
const hitRadius = computed(() => 8 / props.scale)
const displayModel = computed(() => dragModel.value ?? props.model)

const draftPath = computed(() => {
  if (props.tool === 'line' && draftPoints.value.length === 1 && cursor.value) {
    return createLinePath(draftPoints.value[0]!, cursor.value)
  }
  if ((props.tool === 'polyline' || props.tool === 'polygon' || props.tool === 'pen') && draftPoints.value.length > 0) {
    const points = cursor.value ? [...draftPoints.value, cursor.value] : draftPoints.value
    return props.tool === 'polygon'
      ? createPolygonPath(points)
      : createPolylinePath(points, props.tool === 'pen')
  }
  if (props.tool === 'arc' && dragStart.value && cursor.value) {
    return arcFromDrag(dragStart.value, cursor.value)
  }
  if (props.tool === 'star' && dragStart.value && cursor.value) {
    return createStarPath(dragStart.value, pointDistance(dragStart.value, cursor.value), 12, 5)
  }
  return null
})

const arcFromDrag = (start: Point, end: Point): PathModel => {
  const center = midpoint(start, end)
  const radius = Math.max(1, pointDistance(start, end) / 2)
  return createArcPath(
    center,
    radius,
    Math.atan2(start.y - center.y, start.x - center.x),
    Math.atan2(end.y - center.y, end.x - center.x),
  )
}

const resetDraft = (): void => {
  draftPoints.value = []
  dragStart.value = null
}

const toScene = (event: PointerEvent): Point => {
  const element = svg.value
  if (!element) {
    return { x: 0, y: 0 }
  }
  const rect = element.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * props.width,
    y: ((event.clientY - rect.top) / rect.height) * props.height,
  }
}

const hitTest = (point: Point): HitTarget | null => {
  const model = displayModel.value
  const radius = hitRadius.value
  for (let subpathIndex = 0; subpathIndex < model.subpaths.length; subpathIndex += 1) {
    const subpath = model.subpaths[subpathIndex]!
    for (let nodeIndex = 0; nodeIndex < subpath.nodes.length; nodeIndex += 1) {
      const node = subpath.nodes[nodeIndex]!
      if (pointDistance(point, node) <= radius) {
        return { kind: 'node', subpath: subpathIndex, node: nodeIndex }
      }
      if (node.inHandle && pointDistance(point, node.inHandle) <= radius) {
        return { kind: 'handle', subpath: subpathIndex, node: nodeIndex, handle: 'in' }
      }
      if (node.outHandle && pointDistance(point, node.outHandle) <= radius) {
        return { kind: 'handle', subpath: subpathIndex, node: nodeIndex, handle: 'out' }
      }
    }
  }

  let best: HitTarget | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (let subpathIndex = 0; subpathIndex < model.subpaths.length; subpathIndex += 1) {
    const subpath = model.subpaths[subpathIndex]!
    for (let nodeIndex = 0; nodeIndex < subpath.nodes.length - 1; nodeIndex += 1) {
      const from = subpath.nodes[nodeIndex]!
      const to = subpath.nodes[nodeIndex + 1]!
      const t = closestSegmentT(from, to, point)
      const distance = pointDistance(segmentPointAt(from, to, t), point)
      if (distance <= radius * 2.5 && distance < bestDistance) {
        bestDistance = distance
        best = { kind: 'segment', subpath: subpathIndex, node: nodeIndex, t }
      }
    }
  }
  return best
}

const finishDraft = (): void => {
  const points = draftPoints.value
  if (props.tool === 'line' && points.length === 2) {
    emit('create', createLinePath(points[0]!, points[1]!), getPathTool('line').label)
  } else if (props.tool === 'polyline' && points.length >= 2) {
    emit('create', createPolylinePath(points), getPathTool('polyline').label)
  } else if (props.tool === 'polygon' && points.length >= 3) {
    emit('create', createPolygonPath(points), getPathTool('polygon').label)
  } else if (props.tool === 'pen' && points.length >= 2) {
    emit('create', createPolylinePath(points, true), getPathTool('pen').label)
  }
  resetDraft()
}

const handlePointerDown = (event: PointerEvent): void => {
  if (!active.value) {
    return
  }
  const point = toScene(event)

  if (props.tool === 'arc' || props.tool === 'star') {
    dragStart.value = point
    return
  }
  if (props.tool === 'line') {
    if (draftPoints.value.length >= 2) {
      draftPoints.value = [point]
    } else {
      draftPoints.value = [...draftPoints.value, point]
      if (draftPoints.value.length === 2) {
        finishDraft()
      }
    }
    return
  }
  if (props.tool === 'polyline' || props.tool === 'polygon' || props.tool === 'pen') {
    draftPoints.value = [...draftPoints.value, point]
    return
  }

  if (!props.editing) {
    return
  }
  const hit = hitTest(point)
  if (!hit) {
    return
  }
  if (hit.kind === 'segment') {
    emit('command', {
      kind: 'split-segment',
      subpath: hit.subpath,
      node: hit.node,
      t: hit.t ?? 0.5,
    })
    return
  }
  dragModel.value = JSON.parse(JSON.stringify(props.model)) as PathModel
  dragState.value = {
    kind: hit.kind,
    subpath: hit.subpath,
    node: hit.node,
    handle: hit.handle ?? 'out',
  }
  emit('select', hit.subpath, hit.node)
}

const handlePointerMove = (event: PointerEvent): void => {
  cursor.value = toScene(event)
  const state = dragState.value
  const model = dragModel.value
  if (!state || !model) {
    return
  }
  const position = toScene(event)
  dragModel.value =
    state.kind === 'node'
      ? moveNode(model, state.subpath, state.node, position)
      : moveHandle(model, state.subpath, state.node, state.handle, position)
}

const handlePointerUp = (): void => {
  const state = dragState.value
  const model = dragModel.value
  if (state && model) {
    const position = state.kind === 'node'
      ? model.subpaths[state.subpath]!.nodes[state.node]!
      : state.handle === 'in'
        ? model.subpaths[state.subpath]!.nodes[state.node]!.inHandle ?? model.subpaths[state.subpath]!.nodes[state.node]!
        : model.subpaths[state.subpath]!.nodes[state.node]!.outHandle ?? model.subpaths[state.subpath]!.nodes[state.node]!
    if (state.kind === 'node') {
      emit('command', { kind: 'move-node', subpath: state.subpath, node: state.node, position })
    } else {
      emit('command', {
        kind: 'move-handle',
        subpath: state.subpath,
        node: state.node,
        handle: state.handle,
        position,
      })
    }
  }
  dragState.value = null
  dragModel.value = null

  if (props.tool === 'arc' && dragStart.value && cursor.value) {
    emit('create', arcFromDrag(dragStart.value, cursor.value), getPathTool('arc').label)
  } else if (props.tool === 'star' && dragStart.value && cursor.value) {
    emit(
      'create',
      createStarPath(dragStart.value, pointDistance(dragStart.value, cursor.value), 12, 5),
      getPathTool('star').label,
    )
  }
  resetDraft()
}

const handleDoubleClick = (event: MouseEvent): void => {
  if (!props.editing) {
    return
  }
  const point = toScene(event as PointerEvent)
  const hit = hitTest(point)
  if (hit?.kind === 'segment') {
    emit('command', {
      kind: 'insert-node',
      subpath: hit.subpath,
      node: hit.node + 1,
      position: segmentPointAt(
        displayModel.value.subpaths[hit.subpath]!.nodes[hit.node]!,
        displayModel.value.subpaths[hit.subpath]!.nodes[hit.node + 1]!,
        hit.t ?? 0.5,
      ),
    })
  } else if (props.tool !== 'select') {
    finishDraft()
  }
}

const handleKeyDown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    const hadDraft = draftPoints.value.length > 0 || dragStart.value !== null || dragState.value !== null
    resetDraft()
    dragState.value = null
    dragModel.value = null
    if (hadDraft) {
      emit('cancel')
    }
  } else if (event.key === 'Enter' && draftPoints.value.length > 0) {
    finishDraft()
  }
}

watch(
  () => props.tool,
  () => resetDraft(),
)

watch(active, (value) => {
  if (!value) {
    resetDraft()
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <svg
    ref="svg"
    class="path-overlay"
    :class="{ 'is-active': active }"
    :viewBox="`0 0 ${props.width} ${props.height}`"
    :style="{ width: `${props.width * props.scale}px`, height: `${props.height * props.scale}px` }"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointerleave="handlePointerUp"
    @dblclick="handleDoubleClick"
    @contextmenu.prevent
  >
    <path v-if="draftPath" :d="serializePathModel(draftPath)" class="path-draft" />

    <g v-if="props.editing">
      <template v-for="(subpath, subpathIndex) in displayModel.subpaths" :key="subpathIndex">
        <g v-for="(node, nodeIndex) in subpath.nodes" :key="`${subpathIndex}-${nodeIndex}`">
          <line v-if="node.outHandle" :x1="node.x" :y1="node.y" :x2="node.outHandle.x" :y2="node.outHandle.y" class="handle-line" />
          <line v-if="node.inHandle" :x1="node.x" :y1="node.y" :x2="node.inHandle.x" :y2="node.inHandle.y" class="handle-line" />
          <circle v-if="node.outHandle" :cx="node.outHandle.x" :cy="node.outHandle.y" :r="3.5 / props.scale" class="handle-dot" />
          <circle v-if="node.inHandle" :cx="node.inHandle.x" :cy="node.inHandle.y" :r="3.5 / props.scale" class="handle-dot" />
          <rect
            :x="node.x - 4 / props.scale"
            :y="node.y - 4 / props.scale"
            :width="8 / props.scale"
            :height="8 / props.scale"
            :class="['node-box', { 'is-corner': node.mode === 'corner' }]"
          />
        </g>
      </template>
    </g>
  </svg>
</template>
