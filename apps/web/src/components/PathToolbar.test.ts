import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { findObjectsById } from '@/inspector/sceneTree'
import type { HandleMode } from '@/paths/model'
import { parsePathData } from '@/paths/parser'
import { createRectanglePath } from '@/paths/shapes'
import { useEngineStore } from '@/stores/engine'
import PathToolbar from './PathToolbar.vue'

const nodeModeOf = (store: ReturnType<typeof useEngineStore>): HandleMode => {
  if (!store.scene) {
    return 'corner'
  }
  const object = findObjectsById(store.scene, store.selectedObjectIds)[0]
  if (!object || object.type !== 'path') {
    return 'corner'
  }
  return (
    parsePathData(object.d).subpaths[store.selectedSubpath]?.nodes[store.selectedNode]?.mode ??
    'corner'
  )
}

interface Mounted {
  host: HTMLElement
  app: ReturnType<typeof createApp>
  store: ReturnType<typeof useEngineStore>
}

const mountToolbar = async (): Promise<Mounted> => {
  const host = document.createElement('div')
  const app = createApp(PathToolbar)
  app.use(createPinia())
  app.mount(host)
  await nextTick()
  return { host, app, store: useEngineStore() }
}

const buttonWith = (host: HTMLElement, label: string, exact = false): HTMLButtonElement => {
  const button = Array.from(host.querySelectorAll('button')).find((item) =>
    exact ? item.textContent?.trim() === label : item.textContent?.includes(label),
  )
  if (!button) {
    throw new Error(`Button not found: ${label}`)
  }
  return button as HTMLButtonElement
}

describe('PathToolbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders every drawing tool', async () => {
    const { host, app } = await mountToolbar()
    const text = host.textContent ?? ''
    for (const label of ['Wybór', 'Linia', 'Wielościęń', 'Rysownik', 'Łuk', 'Wielokąt', 'Gwiazda']) {
      expect(text).toContain(label)
    }
    app.unmount()
  })

  it('switches the active tool through the store', async () => {
    const { host, app, store } = await mountToolbar()
    buttonWith(host, 'Rysownik').click()
    await nextTick()
    expect(store.pathTool).toBe('pen')
    expect(store.nodeEditing).toBe(false)
    app.unmount()
  })

  it('disables boolean operations until two closed paths are selected', async () => {
    const { host, app, store } = await mountToolbar()
    await store.render()

    const union = buttonWith(host, 'Łączenie')
    expect(union.disabled).toBe(true)

    store.addPathFromModel(createRectanglePath(0, 0, 10, 10), 'A')
    await nextTick()
    expect(union.disabled).toBe(true)

    const second = store.addPathFromModel(createRectanglePath(20, 20, 10, 10), 'B')!
    store.setSelectedObjectIds(['path-1', second.id])
    await nextTick()
    expect(union.disabled).toBe(false)
    app.unmount()
  })

  it('disables segment tools without a single selected path', async () => {
    const { host, app, store } = await mountToolbar()
    await store.render()

    expect(buttonWith(host, 'Połącz').disabled).toBe(true)
    expect(buttonWith(host, 'Rozdziel').disabled).toBe(true)
    expect(buttonWith(host, 'Odwróć').disabled).toBe(true)

    store.addPathFromModel(createRectanglePath(0, 0, 10, 10), 'A')
    await nextTick()
    expect(buttonWith(host, 'Odwróć').disabled).toBe(false)
    expect(buttonWith(host, 'Połącz').disabled).toBe(true)
    app.unmount()
  })

  it('runs a boolean operation and selects the result', async () => {
    const { host, app, store } = await mountToolbar()
    await store.render()
    const first = store.addPathFromModel(createRectanglePath(0, 0, 100, 100), 'A')!
    const second = store.addPathFromModel(createRectanglePath(50, 50, 100, 100), 'B')!
    store.setSelectedObjectIds([first.id, second.id])
    await nextTick()

    buttonWith(host, 'Przecięcie').click()
    await nextTick()

    expect(store.selectedObjectIds).toHaveLength(1)
    expect(store.selectedObjectIds[0]).not.toBe(first.id)
    expect(store.selectedObjectIds[0]).not.toBe(second.id)
    app.unmount()
  })

  it('toggles node editing for the selected path', async () => {
    const { host, app, store } = await mountToolbar()
    await store.render()
    store.addPathFromModel(createRectanglePath(0, 0, 10, 10), 'A')
    await nextTick()

    buttonWith(host, 'Punkty').click()
    await nextTick()
    expect(store.nodeEditing).toBe(false)

    buttonWith(host, 'Punkty').click()
    await nextTick()
    expect(store.nodeEditing).toBe(true)
    app.unmount()
  })

  it('removes selected paths', async () => {
    const { host, app, store } = await mountToolbar()
    await store.render()
    store.addPathFromModel(createRectanglePath(0, 0, 10, 10), 'A')
    await nextTick()

    buttonWith(host, 'Usuń', true).click()
    await nextTick()
    expect(store.selectedObjectIds).toEqual([])
    app.unmount()
  })

  it('switches the selected node between corner, smooth and symmetric', async () => {
    const { host, app, store } = await mountToolbar()
    await store.render()
    store.addPathFromModel(parsePathData('M 0 0 C 10 10 20 10 30 0 C 50 20 45 30 60 0'), 'Curve')
    store.setSelectedNode(0, 1)
    await nextTick()
    expect(nodeModeOf(store)).toBe('corner')

    buttonWith(host, 'Płynny').click()
    await nextTick()
    expect(store.selectedNode).toBe(1)
    expect(nodeModeOf(store)).toBe('smooth')

    buttonWith(host, 'Sym.').click()
    await nextTick()
    expect(nodeModeOf(store)).toBe('symmetric')
    app.unmount()
  })

  it('disables node mode tools without a selected path', async () => {
    const { host, app, store } = await mountToolbar()
    await store.render()

    expect(buttonWith(host, 'Załamanie').disabled).toBe(true)
    expect(buttonWith(host, 'Usuń punkt').disabled).toBe(true)

    store.addPathFromModel(createRectanglePath(0, 0, 10, 10), 'A')
    await nextTick()
    expect(buttonWith(host, 'Załamanie').disabled).toBe(false)
    app.unmount()
  })
})
