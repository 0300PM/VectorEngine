import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { findObjectsById } from '@/inspector/sceneTree'
import { useEngineStore } from '@/stores/engine'
import type { RectangleObject, SceneObject } from '@/types/scene'
import PropertiesInspector from './PropertiesInspector.vue'

type Store = ReturnType<typeof useEngineStore>

const objectById = (store: Store, id: string): SceneObject | undefined => {
  if (!store.scene) {
    return undefined
  }
  return findObjectsById(store.scene, [id])[0]
}

const rectOf = (store: Store, id: string): RectangleObject | undefined =>
  objectById(store, id) as RectangleObject | undefined

const mountInspector = async (pinia: ReturnType<typeof createPinia>): Promise<{
  host: HTMLDivElement
  app: ReturnType<typeof createApp>
}> => {
  const host = document.createElement('div')
  const app = createApp(PropertiesInspector)
  app.use(pinia)
  app.mount(host)
  await nextTick()
  return { host, app }
}

const typeInto = (input: HTMLInputElement, value: string): void => {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PropertiesInspector panel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the layers list plus transform, appearance and shape sections', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useEngineStore()
    await store.render()
    store.selectInspectorObject('frame', false)

    const { host, app } = await mountInspector(pinia)
    const text = host.textContent ?? ''
    expect(text).toContain('Layers')
    expect(text).toContain('Transform')
    expect(text).toContain('Appearance')
    expect(text).toContain('Shape')
    expect(text).toContain('Corner Radius X')
    expect(text).toContain('Card Frame')
    app.unmount()
  })

  it('shows an empty state when nothing is selected', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useEngineStore()
    await store.render()
    store.selectedObjectIds = []

    const { host, app } = await mountInspector(pinia)
    expect(host.textContent).toContain('Nothing selected')
    app.unmount()
  })

  it('edits width through the dimension control and updates the scene', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useEngineStore()
    await store.render()
    store.selectInspectorObject('frame', false)

    const { host, app } = await mountInspector(pinia)
    const widthInput = host.querySelector('input[aria-label="Width"]') as HTMLInputElement
    expect(widthInput).not.toBeNull()
    expect(widthInput.value).toBe('1040')

    typeInto(widthInput, '480')
    await nextTick()

    expect(rectOf(store, 'frame')?.width).toBe(480)
    expect(store.source).toContain('"width": 480')
    app.unmount()
  })

  it('keeps the aspect ratio locked while editing dimensions', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useEngineStore()
    await store.render()
    store.selectInspectorObject('frame', false)
    expect(store.inspectorLockAspect).toBe(true)

    const { host, app } = await mountInspector(pinia)
    const widthInput = host.querySelector('input[aria-label="Width"]') as HTMLInputElement
    typeInto(widthInput, '480')
    await nextTick()

    const frame = rectOf(store, 'frame')
    expect(frame?.width).toBe(480)
    expect(frame?.height).toBe(Math.round(480 / (1040 / 640)))
    app.unmount()
  })

  it('edits fill color through the color field', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useEngineStore()
    await store.render()
    store.selectInspectorObject('core', false)

    const { host, app } = await mountInspector(pinia)
    const fillInput = host.querySelector('input[aria-label="Fill value"]') as HTMLInputElement
    typeInto(fillInput, '#FF0000')
    await nextTick()

    expect(objectById(store, 'core')?.fill).toBe('#FF0000')
    app.unmount()
  })

  it('commits edits to history and restores them with undo', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useEngineStore()
    await store.render()
    store.selectInspectorObject('frame', false)

    const { host, app } = await mountInspector(pinia)
    const widthInput = host.querySelector('input[aria-label="Width"]') as HTMLInputElement
    widthInput.dispatchEvent(new Event('focus'))
    typeInto(widthInput, '480')
    widthInput.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    expect(store.canUndo).toBe(true)
    expect(rectOf(store, 'frame')?.width).toBe(480)

    const undoButton = host.querySelector('button[aria-label="Undo"]') as HTMLButtonElement
    undoButton.click()
    await nextTick()

    expect(rectOf(store, 'frame')?.width).toBe(1040)
    app.unmount()
  })
})
