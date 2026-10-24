import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { collectSceneObjects } from '@/inspector/sceneTree'
import { hitTestScene } from '@/canvas/hitTest'
import { useEngineStore } from '@/stores/engine'
import type { RectangleObject } from '@/types/scene'
import CanvasControls from './CanvasControls.vue'
import CanvasStage from './CanvasStage.vue'

interface Mounted {
  host: HTMLElement
  store: ReturnType<typeof useEngineStore>
  viewport: HTMLElement
  app: ReturnType<typeof createApp>
}

const stageProps = {
  svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  width: 1000,
  height: 800,
  objectCount: 3,
  renderState: 'idle' as const,
  stale: false,
  backdrop: 'checker' as const,
  pathModel: null,
  pathTool: 'select' as const,
  nodeEditing: false,
}

const emptyPoint = (store: ReturnType<typeof useEngineStore>): { x: number; y: number } => {
  const objects = store.scene ? collectSceneObjects(store.scene) : []
  for (let x = 0; x < 1000; x += 40) {
    for (let y = 0; y < 800; y += 40) {
      if (!hitTestScene(objects, { x, y }, false)) {
        return { x, y }
      }
    }
  }
  return { x: 0, y: 0 }
}

const rectangle = (id: string, x: number, y: number, width: number, height: number): RectangleObject => ({
  id,
  type: 'rect',
  x,
  y,
  width,
  height,
})

const define = (event: Event, values: Record<string, unknown>): Event => {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { value, configurable: true })
  }
  return event
}

const pointerEvent = (type: string, init: Record<string, unknown> = {}): Event => {
  const { pointerId, ...rest } = init
  return define(new MouseEvent(type, { bubbles: true, cancelable: true }), { pointerId: pointerId ?? 1, ...rest })
}

const wheelEvent = (init: Record<string, unknown>): Event =>
  define(new Event('wheel', { bubbles: true, cancelable: true }), init)

describe('canvas stage', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    if (typeof ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      } as unknown as typeof ResizeObserver
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const mount = async (): Promise<Mounted> => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useEngineStore()
    await store.render()
    const host = document.createElement('div')
    const app = createApp({
      render: () => [h(CanvasStage, stageProps), h(CanvasControls)],
    })
    app.use(pinia)
    app.mount(host)
    await nextTick()
    const viewport = host.querySelector('.canvas-viewport') as HTMLElement
    viewport.getBoundingClientRect = () =>
      ({ x: 0, y: 0, width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 }) as DOMRect
    store.setViewport({ width: 800, height: 600 })
    store.setView({ scale: 1, offsetX: 0, offsetY: 0 })
    await nextTick()
    return { host, store, viewport, app }
  }

  it('renders the artboard, the grid and the ruler ticks', async () => {
    const { host, store } = await mount()
    expect(host.querySelector('.canvas-artboard')).not.toBeNull()
    expect(store.gridVisible).toBe(true)
    const minor = host.querySelectorAll('.grid-minor')
    expect(minor.length).toBeGreaterThan(0)
    expect(host.querySelectorAll('.canvas-ruler').length).toBe(2)
    expect(host.querySelectorAll('.ruler-tick, .ruler-tick-major').length).toBeGreaterThan(0)
  })

  it('zooms around the cursor without moving the document', async () => {
    const { viewport, store } = await mount()
    store.toggleRulers()
    const before = store.view
    viewport.dispatchEvent(wheelEvent({ deltaY: -100, clientX: 400, clientY: 300 }))
    await nextTick()

    expect(store.view.scale).toBeGreaterThan(before.scale)
    const document = { x: (400 - store.view.offsetX) / store.view.scale, y: (300 - store.view.offsetY) / store.view.scale }
    expect(document.x).toBeCloseTo(400, 6)
    expect(document.y).toBeCloseTo(300, 6)
  })

  it('pans with the hand tool and with space-drag', async () => {
    const { viewport, store } = await mount()
    store.toggleHandTool()
    viewport.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 140, clientY: 130 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 140, clientY: 130 }))
    await nextTick()
    expect(store.view.offsetX).toBe(40)
    expect(store.view.offsetY).toBe(30)

    viewport.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 25 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 25 }))
    await nextTick()
    expect(store.view.offsetX).toBe(90)
    expect(store.view.offsetY).toBe(45)
  })

  it('selects an object with a click', async () => {
    const { viewport, store } = await mount()
    store.createSceneObject(rectangle('pick-me', 100, 100, 200, 150))
    store.setSelectedObjectIds([])
    await nextTick()

    viewport.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 170 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 200, clientY: 170 }))
    await nextTick()

    expect(store.selectedObjectIds).toEqual(['pick-me'])
  })

  it('adds to the selection with shift and removes it again', async () => {
    const { viewport, store } = await mount()
    store.createSceneObject(rectangle('first', 100, 100, 100, 100))
    store.createSceneObject(rectangle('second', 400, 100, 100, 100))
    store.setSelectedObjectIds([])
    await nextTick()

    viewport.dispatchEvent(pointerEvent('pointerdown', { button: 0, shiftKey: true, clientX: 150, clientY: 150 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 150, clientY: 150 }))
    viewport.dispatchEvent(pointerEvent('pointerdown', { button: 0, shiftKey: true, clientX: 450, clientY: 150 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 450, clientY: 150 }))
    await nextTick()
    expect(store.selectedObjectIds.sort()).toEqual(['first', 'second'])

    viewport.dispatchEvent(pointerEvent('pointerdown', { button: 0, shiftKey: true, clientX: 150, clientY: 150 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 150, clientY: 150 }))
    await nextTick()
    expect(store.selectedObjectIds).toEqual(['second'])
  })

  it('selects objects inside the marquee and clears on an empty click', async () => {
    const { viewport, store } = await mount()
    store.createSceneObject(rectangle('inside', 50, 50, 60, 60))
    store.createSceneObject(rectangle('outside', 900, 700, 60, 60))
    store.setSelectedObjectIds([])
    await nextTick()

    viewport.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 300 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 300 }))
    await nextTick()
    expect(store.selectedObjectIds).toEqual(['inside'])

    const empty = emptyPoint(store)
    viewport.dispatchEvent(pointerEvent('pointerdown', { button: 0, clientX: empty.x, clientY: empty.y }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: empty.x, clientY: empty.y }))
    await nextTick()
    expect(store.selectedObjectIds).toEqual([])
  })

  it('creates and removes guides from the rulers', async () => {
    const { host, store } = await mount()
    store.toggleSnap()
    const ruler = host.querySelector('.canvas-ruler-top') as HTMLElement
    ruler.dispatchEvent(pointerEvent('pointerdown', { clientX: 500, clientY: 6 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 620, clientY: 6 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 620, clientY: 6 }))
    await nextTick()

    expect(store.guides).toHaveLength(1)
    expect(store.guides[0]?.orientation).toBe('v')
    expect(store.guides[0]?.position).toBeCloseTo(598, 6)

    const guide = host.querySelector('.guide-line') as HTMLElement
    guide.dispatchEvent(pointerEvent('pointerdown', { clientX: 620, clientY: 300 }))
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 420, clientY: 300 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 420, clientY: 300 }))
    await nextTick()
    expect(store.guides).toHaveLength(1)
    expect(store.guides[0]?.position).toBeCloseTo(398, 6)

    guide.dispatchEvent(pointerEvent('pointerdown', { clientX: 420, clientY: 300 }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 300 }))
    await nextTick()
    expect(store.guides).toHaveLength(1)
    expect(store.guides[0]?.position).toBeCloseTo(398, 6)

    store.toggleFullscreen()
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(store.fullscreen).toBe(false)
  })

  it('aligns the selection from the toolbar', async () => {
    const { host, store } = await mount()
    store.createSceneObject(rectangle('a', 0, 0, 100, 100))
    store.createSceneObject(rectangle('b', 300, 200, 100, 100))
    store.setSelectedObjectIds(['a', 'b'])
    await nextTick()

    const button = host.querySelector('[title="Wyrównaj do prawej"]') as HTMLButtonElement
    button.click()
    await nextTick()

    const objects = store.selectionObjects as unknown as { id: string; transform?: { translateX?: number } }[]
    const byId = new Map(objects.map((object) => [object.id, object]))
    expect((byId.get('a')?.transform?.translateX ?? 0)).toBeCloseTo(300, 6)
    expect((byId.get('b')?.transform?.translateX ?? 0)).toBeCloseTo(0, 6)
    expect(store.canUndo).toBe(true)
  })

  it('tracks the cursor position in document coordinates', async () => {
    const { viewport, store } = await mount()
    store.toggleRulers()
    expect(store.cursorDocumentPoint).toBeNull()
    viewport.dispatchEvent(pointerEvent('pointermove', { clientX: 250, clientY: 180 }))
    await nextTick()
    expect(store.cursorDocumentPoint).toEqual({ x: 250, y: 180 })
  })
})
