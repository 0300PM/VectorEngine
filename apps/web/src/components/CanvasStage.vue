<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { EditorBackdrop } from '@/export/types'
import type { PathCommand } from '@/paths/editor'
import type { PathModel } from '@/paths/model'
import type { PathToolKind } from '@/paths/tools'
import type { RenderState } from '@/types/engine'
import { collectSceneObjects } from '@/inspector/sceneTree'
import { useEngineStore } from '@/stores/engine'
import { screenToDocument, visibleDocumentRect } from '@/canvas/view'
import { gridLines, snapDocumentPoint } from '@/canvas/snap'
import { hitTestScene, objectBounds, objectOutline, sceneBounds } from '@/canvas/hitTest'
import { hitGuide } from '@/canvas/guides'
import { marqueeFromPoints } from '@/canvas/selection'
import { identityMatrix } from '@/export/bounds'
import type { Point, Transform } from '@/types/scene'
import type { Rect } from '@/canvas/geometry'
import type { Size } from '@/canvas/view'
import PathEditorOverlay from './PathEditorOverlay.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  svg: string | null
  width: number
  height: number
  objectCount: number
  renderState: RenderState
  stale: boolean
  backdrop: EditorBackdrop
  pathModel: PathModel | null
  pathTool: PathToolKind
  nodeEditing: boolean
}>()

const emit = defineEmits<{
  'update:backdrop': [value: EditorBackdrop]
  'path-command': [command: PathCommand]
  'path-create': [model: PathModel, name: string]
  'path-select': [subpath: number, node: number]
  'path-cancel': []
}>()

const MAX_GRID_LINES = 220
const RULER_SIZE = 22
const GUIDE_HIT_PX = 9
const TICK_LABEL_PX = 68

const store = useEngineStore()
const viewport = ref<HTMLDivElement | null>(null)
const imageUrl = ref<string | null>(null)
const spaceHeld = ref(false)
const cursor = ref<Point | null>(null)
const pendingPoint = ref<Point | null>(null)

interface ObjectDragEntry {
  id: string
  transform: Transform
}

interface DragState {
  kind: 'pan' | 'marquee' | 'object' | 'guide'
  pointerId: number
  startScreen: Point
  startDocument: Point
  anchor: Point
  entries: ObjectDragEntry[]
  guideId: string | null
  guideOrientation: 'h' | 'v' | null
}

let drag: DragState | null = null
let frame = 0
let resizeObserver: ResizeObserver | null = null

const scale = computed(() => store.view.scale)
const offsetX = computed(() => store.view.offsetX)
const offsetY = computed(() => store.view.offsetY)
const viewportSize = computed<Size>(() => store.viewport)
const rulerInset = computed(() => (store.rulersVisible ? RULER_SIZE : 0))
const contentSize = computed<Size>(() => ({
  width: Math.max(0, viewportSize.value.width - rulerInset.value),
  height: Math.max(0, viewportSize.value.height - rulerInset.value),
}))
const visibleRect = computed<Rect>(() => visibleDocumentRect(store.view, store.viewport))
const canRender = computed(() => props.width > 0 && props.height > 0)

const worldStyle = computed(() => ({ transform: `translate(${offsetX.value}px, ${offsetY.value}px)` }))
const artboardStyle = computed(() => ({
  width: `${Math.max(1, props.width * scale.value)}px`,
  height: `${Math.max(1, props.height * scale.value)}px`,
}))
const overlayStyle = computed(() => ({ width: artboardStyle.value.width, height: artboardStyle.value.height }))

const screenX = (documentX: number): number => offsetX.value + documentX * scale.value
const screenY = (documentY: number): number => offsetY.value + documentY * scale.value

const adaptSpacing = (extent: number, base: number): number => {
  const limit = extent / MAX_GRID_LINES
  let spacing = base
  while (spacing < limit) {
    spacing *= 2
  }
  return spacing
}

const gridModel = computed(() => {
  if (!store.gridVisible || !canRender.value) {
    return null
  }
  const rect = visibleRect.value
  const minor = adaptSpacing(Math.max(rect.width, rect.height), store.gridSpacing)
  const major = adaptSpacing(Math.max(rect.width, rect.height), store.gridMajorSpacing)
  return {
    x: gridLines(rect.x, rect.x + rect.width, minor),
    y: gridLines(rect.y, rect.y + rect.height, minor),
    majorX: gridLines(rect.x, rect.x + rect.width, major),
    majorY: gridLines(rect.y, rect.y + rect.height, major),
  }
})

const selectionOutlines = computed(() =>
  store.selectionObjects.map((object) => ({
    id: object.id,
    points: objectOutline(object, identityMatrix())
      .map((polyline) => polyline.map((point) => `${point.x},${point.y}`).join(' '))
      .join(' '),
  })),
)

const marqueeScreen = computed(() => {
  const rect = store.marqueeRect
  if (!rect) {
    return null
  }
  return {
    x: screenX(rect.x),
    y: screenY(rect.y),
    width: Math.max(0, rect.width * scale.value),
    height: Math.max(0, rect.height * scale.value),
  }
})

const guideLines = computed(() =>
  store.guides.map((guide) => {
    if (guide.orientation === 'v') {
      return { x1: screenX(guide.position), y1: 0, x2: screenX(guide.position), y2: Math.max(0, viewportSize.value.height) }
    }
    return { x1: 0, y1: screenY(guide.position), x2: Math.max(0, viewportSize.value.width), y2: screenY(guide.position) }
  }),
)

const guideHitRects = computed(() =>
  store.guides.map((guide) => {
    const thickness = GUIDE_HIT_PX * 2
    if (guide.orientation === 'v') {
      return {
        x: screenX(guide.position) - GUIDE_HIT_PX,
        y: 0,
        width: thickness,
        height: Math.max(0, viewportSize.value.height),
      }
    }
    return {
      x: 0,
      y: screenY(guide.position) - GUIDE_HIT_PX,
      width: Math.max(0, viewportSize.value.width),
      height: thickness,
    }
  }),
)

const rulerModel = computed(() => {
  const rect = visibleRect.value
  const spacing = adaptSpacing(Math.max(rect.width, rect.height), store.gridMajorSpacing)
  const screenSpacing = Math.max(spacing * scale.value, 1e-6)
  const step = Math.max(1, Math.ceil(TICK_LABEL_PX / screenSpacing))
  const ticks = (values: number[], horizontal: boolean): { position: number; major: boolean; label: string }[] =>
    values
      .map((value, index) => ({
        position: horizontal ? screenX(value) : screenY(value),
        major: (index + 1) % step === 0,
        label: formatValue(value),
      }))
      .filter((tick) => Number.isFinite(tick.position))
  return {
    top: ticks(gridLines(rect.x, rect.x + rect.width, spacing), true),
    left: ticks(gridLines(rect.y, rect.y + rect.height, spacing), false),
  }
})

const formatValue = (value: number): string => String(Math.round(value * 100) / 100)

const snappedCursor = computed(() => {
  const point = pendingPoint.value
  if (!point || !store.snapSettings.enabled) {
    return null
  }
  const result = snapDocumentPoint(point, store.snapSettings, scale.value, store.buildSnapCandidates(visibleRect.value))
  return result.matched ? result.point : null
})

const overlayModel = computed<PathModel>(() => props.pathModel ?? { subpaths: [] })
const busy = computed(() => ['initializing', 'validating', 'rendering'].includes(props.renderState))
const isPanning = computed(() => spaceHeld.value || store.handTool)
const cursorStyle = computed(() => (isPanning.value ? 'grab' : 'default'))

const localPoint = (event: { clientX: number; clientY: number }): Point => {
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect) {
    return { x: 0, y: 0 }
  }
  return { x: event.clientX - rect.left - rulerInset.value, y: event.clientY - rect.top - rulerInset.value }
}

const documentAt = (event: { clientX: number; clientY: number }): Point => screenToDocument(store.view, localPoint(event))

const snapPoint = (point: Point): Point =>
  snapDocumentPoint(point, store.snapSettings, scale.value, store.buildSnapCandidates(visibleRect.value)).point

const scheduleFrame = (task: () => void): void => {
  if (frame !== 0) {
    return
  }
  frame = requestAnimationFrame(() => {
    frame = 0
    task()
  })
}

const applyObjectDelta = (): void => {
  if (!drag || drag.kind !== 'object' || !pendingPoint.value) {
    return
  }
  const snapped = snapPoint(pendingPoint.value)
  const delta = { x: snapped.x - drag.anchor.x, y: snapped.y - drag.anchor.y }
  const patches = new Map<string, { transform: Transform }>()
  for (const entry of drag.entries) {
    patches.set(entry.id, {
      transform: {
        ...entry.transform,
        translateX: (entry.transform.translateX ?? 0) + delta.x,
        translateY: (entry.transform.translateY ?? 0) + delta.y,
      },
    })
  }
  store.applyObjectPatch([...patches.keys()], (object) => patches.get(object.id) ?? {})
}

const handleHover = (event: PointerEvent): void => {
  if (drag) {
    return
  }
  const document = documentAt(event)
  cursor.value = document
  store.setCursorDocumentPoint(document)
}

const updateCursor = (event: { clientX: number; clientY: number }): void => {
  const document = documentAt(event)
  cursor.value = document
  store.setCursorDocumentPoint(document)
  if (drag?.kind === 'object') {
    pendingPoint.value = document
    scheduleFrame(applyObjectDelta)
  } else {
    pendingPoint.value = document
  }
}

const attachDragListeners = (): void => {
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

const detachDragListeners = (): void => {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
}

const handlePointerDown = (event: PointerEvent): void => {
  if (event.button === 2) {
    return
  }
  const target = event.target as HTMLElement | null
  if (target?.closest('.path-overlay')) {
    return
  }
  const screen = localPoint(event)
  const document = screenToDocument(store.view, screen)

  if (event.button === 1 || spaceHeld.value || store.handTool) {
    drag = {
      kind: 'pan',
      pointerId: event.pointerId,
      startScreen: screen,
      startDocument: document,
      anchor: document,
      entries: [],
      guideId: null,
      guideOrientation: null,
    }
    attachDragListeners()
    return
  }

  const hit = store.scene ? hitTestScene(collectSceneObjects(store.scene), document, false) : null
  if (hit) {
    if (event.shiftKey) {
      store.toggleObjectAt(document, false)
    } else {
      store.selectObjectAt(document, false, false)
    }
    const selected = store.selectionObjects
    const box = sceneBounds(selected) ?? objectBounds(hit)
    if (!box || selected.length === 0) {
      drag = null
      return
    }
    const entries = selected.map((object) => ({ id: object.id, transform: object.transform ?? {} }))
    store.beginInspectorEdit()
    drag = {
      kind: 'object',
      pointerId: event.pointerId,
      startScreen: screen,
      startDocument: document,
      anchor: { x: box.minX, y: box.minY },
      entries,
      guideId: null,
      guideOrientation: null,
    }
    pendingPoint.value = document
    attachDragListeners()
    scheduleFrame(applyObjectDelta)
    return
  }

  if (event.shiftKey) {
    store.toggleObjectAt(document, false)
    drag = null
    return
  }

  drag = {
    kind: 'marquee',
    pointerId: event.pointerId,
    startScreen: screen,
    startDocument: document,
    anchor: document,
    entries: [],
    guideId: null,
    guideOrientation: null,
  }
  store.setMarquee(marqueeFromPoints(document, document))
  attachDragListeners()
}

const handlePointerMove = (event: PointerEvent): void => {
  if (!drag || drag.pointerId !== event.pointerId) {
    return
  }
  const screen = localPoint(event)
  if (drag.kind === 'pan') {
    store.panCanvas(screen.x - drag.startScreen.x, screen.y - drag.startScreen.y)
    drag.startScreen = screen
    return
  }
  if (drag.kind === 'marquee') {
    store.setMarquee(marqueeFromPoints(drag.startDocument, screenToDocument(store.view, screen)))
    return
  }
  if (drag.kind === 'guide' && drag.guideId) {
    const snapped = snapPoint(documentAt(event))
    store.updateGuide(drag.guideId, drag.guideOrientation === 'v' ? snapped.x : snapped.y)
    return
  }
  updateCursor(event)
}

const handlePointerUp = (event: PointerEvent): void => {
  if (!drag || drag.pointerId !== event.pointerId) {
    return
  }
  const current = drag
  drag = null
  if (frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }
  detachDragListeners()

  if (current.kind === 'marquee') {
    const rect = store.marqueeRect
    const width = (rect?.width ?? 0) * scale.value
    const height = (rect?.height ?? 0) * scale.value
    if (width < 3 && height < 3) {
      store.setMarquee(null)
      store.selectObjectAt(current.startDocument, false, false)
    } else if (rect) {
      store.marqueeSelectObjects(rect)
    }
    return
  }

  if (current.kind === 'guide' && current.guideId) {
    const guide = store.guides.find((item) => item.id === current.guideId)
    if (guide) {
      const outside =
        guide.orientation === 'v'
          ? guide.position < 0 || guide.position > props.width
          : guide.position < 0 || guide.position > props.height
      if (outside) {
        store.removeGuide(guide.id)
      }
    }
    return
  }

  if (current.kind === 'object') {
    store.setMarquee(null)
    store.commitInspectorEdit()
  }
  pendingPoint.value = cursor.value
}

const handleWheel = (event: WheelEvent): void => {
  const screen = localPoint(event)
  if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault()
    store.panCanvas(-event.deltaY, 0)
    return
  }
  if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    event.preventDefault()
    store.panCanvas(-event.deltaX, 0)
    return
  }
  event.preventDefault()
  const factor = Math.min(2, Math.max(0.5, Math.exp(-event.deltaY * 0.0015)))
  store.zoomAtPoint(screen, factor)
}

const startGuideDrag = (event: PointerEvent): void => {
  if (!store.rulersVisible) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  const document = documentAt(event)
  const hit = hitGuide(store.guides, document, GUIDE_HIT_PX)
  if (!hit) {
    return
  }
  drag = {
    kind: 'guide',
    pointerId: event.pointerId,
    startScreen: localPoint(event),
    startDocument: document,
    anchor: document,
    entries: [],
    guideId: hit.guide.id,
    guideOrientation: hit.orientation,
  }
  attachDragListeners()
}

const startGuide = (orientation: 'h' | 'v', event: PointerEvent): void => {
  event.preventDefault()
  event.stopPropagation()
  const document = documentAt(event)
  const guide = store.addGuide(orientation, orientation === 'v' ? document.x : document.y)
  drag = {
    kind: 'guide',
    pointerId: event.pointerId,
    startScreen: localPoint(event),
    startDocument: document,
    anchor: document,
    entries: [],
    guideId: guide.id,
    guideOrientation: orientation,
  }
  attachDragListeners()
}

const cancelDrag = (): void => {
  if (drag?.kind === 'object') {
    store.cancelInspectorEdit()
  }
  drag = null
  if (frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }
  detachDragListeners()
  store.setMarquee(null)
}

const handleKeyDown = (event: KeyboardEvent): void => {
  if (event.code === 'Space' && !event.repeat) {
    spaceHeld.value = true
    event.preventDefault()
    return
  }
  if (event.key === 'Escape') {
    cancelDrag()
    store.exitFullscreen()
  }
}

const handleKeyUp = (event: KeyboardEvent): void => {
  if (event.code === 'Space') {
    spaceHeld.value = false
  }
}

const handleCommand = (command: PathCommand): void => emit('path-command', command)
const handleCreate = (model: PathModel, name: string): void => emit('path-create', model, name)
const handleSelect = (subpath: number, node: number): void => emit('path-select', subpath, node)
const handleCancel = (): void => emit('path-cancel')

watch(
  () => props.svg,
  (svg) => {
    if (imageUrl.value) {
      URL.revokeObjectURL(imageUrl.value)
      imageUrl.value = null
    }
    if (svg) {
      imageUrl.value = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (!viewport.value) {
    return
  }
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) {
      store.setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
    }
  })
  resizeObserver.observe(viewport.value)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  cancelDrag()
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
  }
})
</script>

<template>
  <div
    ref="viewport"
    class="canvas-viewport"
    :class="[`stage-backdrop-${props.backdrop}`, { 'is-panning': isPanning, 'has-rulers': store.rulersVisible }]"
    :style="{ cursor: cursorStyle }"
    @pointerdown="handlePointerDown"
    @pointermove="handleHover"
    @wheel="handleWheel"
    @contextmenu.prevent
  >
    <div v-if="busy" class="render-badge">
      <UiIcon name="spinner" class="spinning" :size="14" />
      <span>{{ props.renderState === 'initializing' ? 'Starting engine' : 'Updating preview' }}</span>
    </div>
    <div v-if="props.stale && imageUrl" class="stale-badge">Last valid render</div>

    <div class="canvas-world" :style="worldStyle">
      <div v-if="imageUrl && canRender" class="canvas-artboard" :class="`artboard-backdrop-${props.backdrop}`" :style="artboardStyle">
        <img :src="imageUrl" alt="Rendered vector scene" draggable="false" />

        <svg class="canvas-grid-layer" :viewBox="`0 0 ${props.width} ${props.height}`" :style="overlayStyle">
          <template v-if="gridModel">
            <line v-for="value in gridModel.x" :key="`gx-${value}`" :x1="value" y1="0" :x2="value" :y2="props.height" class="grid-minor" />
            <line v-for="value in gridModel.y" :key="`gy-${value}`" x1="0" :y1="value" :x2="props.width" :y2="value" class="grid-minor" />
            <line v-for="value in gridModel.majorX" :key="`gxm-${value}`" :x1="value" y1="0" :x2="value" :y2="props.height" class="grid-major" />
            <line v-for="value in gridModel.majorY" :key="`gym-${value}`" x1="0" :y1="value" :x2="props.width" :y2="value" class="grid-major" />
          </template>
        </svg>

        <svg class="canvas-selection-layer" :viewBox="`0 0 ${props.width} ${props.height}`" :style="overlayStyle">
          <polyline v-for="outline in selectionOutlines" :key="outline.id" :points="outline.points" class="selection-outline" />
        </svg>

        <PathEditorOverlay
          :model="overlayModel"
          :width="props.width"
          :height="props.height"
          :scale="scale"
          :tool="props.pathTool"
          :editing="props.nodeEditing"
          @command="handleCommand"
          @create="handleCreate"
          @select="handleSelect"
          @cancel="handleCancel"
        />
      </div>
    </div>

    <svg
      class="canvas-guide-layer"
      :width="contentSize.width"
      :height="contentSize.height"
      @pointerdown="startGuideDrag"
    >
      <rect
        v-for="(hit, index) in guideHitRects"
        :key="`guide-hit-${index}`"
        :x="hit.x"
        :y="hit.y"
        :width="hit.width"
        :height="hit.height"
        class="guide-hit"
      />
      <line v-for="(line, index) in guideLines" :key="`guide-${index}`" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" class="guide-line" />
      <rect v-if="marqueeScreen" :x="marqueeScreen.x" :y="marqueeScreen.y" :width="marqueeScreen.width" :height="marqueeScreen.height" class="marquee-rect" />
      <circle v-if="snappedCursor" :cx="screenX(snappedCursor.x)" :cy="screenY(snappedCursor.y)" r="5" class="snap-marker" />
    </svg>

    <div
      v-if="store.rulersVisible"
      class="canvas-ruler canvas-ruler-top"
      :style="{ height: `${RULER_SIZE}px` }"
      @pointerdown="startGuide('v', $event)"
    >
      <svg :width="viewportSize.width" :height="RULER_SIZE">
        <line v-for="(tick, index) in rulerModel.top" :key="`rt-${index}`" :x1="tick.position" :y1="tick.major ? 4 : 9" :x2="tick.position" :y2="RULER_SIZE" :class="{ 'ruler-tick-major': tick.major }" />
        <text v-for="(tick, index) in rulerModel.top.filter((item) => item.major)" :key="`rtl-${index}`" :x="tick.position + 3" y="13" class="ruler-label">{{ tick.label }}</text>
      </svg>
    </div>

    <div
      v-if="store.rulersVisible"
      class="canvas-ruler canvas-ruler-left"
      :style="{ width: `${RULER_SIZE}px` }"
      @pointerdown="startGuide('h', $event)"
    >
      <svg :width="RULER_SIZE" :height="viewportSize.height">
        <line v-for="(tick, index) in rulerModel.left" :key="`rl-${index}`" :x1="tick.major ? 4 : 9" :y1="tick.position" :x2="RULER_SIZE" :y2="tick.position" :class="{ 'ruler-tick-major': tick.major }" />
        <text
          v-for="(tick, index) in rulerModel.left.filter((item) => item.major)"
          :key="`rll-${index}`"
          x="3"
          :y="tick.position + 4"
          class="ruler-label"
        >{{ tick.label }}</text>
      </svg>
    </div>

    <div v-if="!imageUrl" class="empty-preview">
      <div class="empty-preview-icon">
        <UiIcon name="preview" :size="24" />
      </div>
      <strong>No preview available</strong>
      <span>Fix the JSON errors to render this scene.</span>
    </div>
  </div>
</template>
