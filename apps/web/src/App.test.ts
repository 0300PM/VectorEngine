import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { useEngineStore } from '@/stores/engine'
import App from './App.vue'

/** Minimal `matchMedia` that honours `min-width`/`max-width` against a fixed viewport. */
const stubMatchMedia = (viewportWidth = 1440): void => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewportWidth })
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList => {
      const min = /min-width:\s*(\d+)px/.exec(query)
      const max = /max-width:\s*(\d+)px/.exec(query)
      const matches =
        (min ? viewportWidth >= Number(min[1]) : true) && (max ? viewportWidth <= Number(max[1]) : true)
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList
    },
  )
}

describe('App shell workspace layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    if (typeof ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in tests')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('mounts the inspector next to the JSON, preview and export panels', async () => {
    const host = document.createElement('div')
    const app = createApp(App)
    app.use(createPinia())
    app.mount(host)
    await nextTick()

    const text = host.textContent ?? ''
    expect(text).toContain('Inspector')
    expect(text).toContain('Scene JSON')
    expect(text).toContain('Export')
    expect(host.querySelector('.inspector-column')).not.toBeNull()
    expect(host.querySelector('.properties-panel')).not.toBeNull()

    expect(host.querySelector('.path-toolbar')).not.toBeNull()
    expect(text).toContain('Vector path tools')
    expect(host.querySelector('.preview-column')).not.toBeNull()

    app.unmount()
  })
})

describe('workspace panel toggles', () => {
  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.useFakeTimers()
    localStorage.clear()
    stubMatchMedia()
    if (typeof ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      } as unknown as typeof ResizeObserver
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in tests')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const mountApp = () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const host = document.createElement('div')
    const app = createApp(App)
    app.use(pinia)
    app.mount(host)
    return { host, app, store: useEngineStore() }
  }

  it('collapses a column to a rail and expands it again', async () => {
    const { host, app, store } = mountApp()
    await nextTick()

    expect(host.querySelectorAll('.panel-toggle').length).toBe(5)
    const workspace = host.querySelector('.workspace') as HTMLElement
    expect(workspace.getAttribute('style')).toContain('var(--col-source)')
    expect((host.querySelector('.editor-column') as HTMLElement).classList.contains('panel-hidden')).toBe(false)

    // first activation collapses the column into a rail without hiding it
    ;(host.querySelector('[aria-label="Source: Collapse"]') as HTMLButtonElement).click()
    await nextTick()

    expect(store.panelVisible.json).toBe(true)
    expect(store.panelCollapsed.json).toBe(true)
    const editor = host.querySelector('.editor-column') as HTMLElement
    expect(editor.classList.contains('is-collapsed')).toBe(true)
    expect(workspace.getAttribute('style')).not.toContain('var(--col-source)')
    expect(workspace.getAttribute('style')).toContain('var(--rail)')
    const rail = host.querySelector('.panel-rail') as HTMLElement
    expect(rail).not.toBeNull()
    expect(rail.textContent).toContain('Source')

    // second activation hides the panel entirely
    ;(host.querySelector('[aria-label="Source: Hide"]') as HTMLButtonElement).click()
    await nextTick()
    expect(store.panelVisible.json).toBe(false)
    expect(editor.classList.contains('panel-hidden')).toBe(true)

    ;(host.querySelector('[aria-label="Source: Show"]') as HTMLButtonElement).click()
    await nextTick()
    expect(store.panelVisible.json).toBe(true)
    expect(store.panelCollapsed.json).toBe(false)
    expect(workspace.getAttribute('style')).toContain('var(--col-source)')

    app.unmount()
  })

  it('expands a rail from the panel header chevron and the rail itself', async () => {
    const { host, app, store } = mountApp()
    await nextTick()
    store.setPanelCollapsed('properties', true)
    await nextTick()

    ;(host.querySelector('.panel-rail') as HTMLElement).click()
    await nextTick()
    expect(store.panelCollapsed.properties).toBe(false)

    const collapseButton = host.querySelector('[aria-label="Collapse Properties panel"]') as HTMLButtonElement
    expect(collapseButton).not.toBeNull()
    collapseButton.click()
    await nextTick()
    expect(store.panelCollapsed.properties).toBe(true)

    app.unmount()
  })

  it('restores every collapsed column at once', async () => {
    const { host, app, store } = mountApp()
    await nextTick()
    store.collapsePanels()
    await nextTick()

    const restore = host.querySelector('.workspace-restore-button') as HTMLButtonElement
    expect(restore).not.toBeNull()
    restore.click()
    await nextTick()

    expect(store.panelCollapsed).toEqual({ json: false, properties: false, export: false })
    app.unmount()
  })

  it('shows the product banner and hides it when dismissed', async () => {
    const { host, app, store } = mountApp()
    await nextTick()

    const banner = host.querySelector('.app-banner') as HTMLElement
    expect(banner).not.toBeNull()
    expect(banner.textContent).toContain('Vector Engine')
    expect(banner.textContent).toContain('JSON in · pixels out')

    ;(banner.querySelector('.banner-dismiss') as HTMLButtonElement).click()
    await nextTick()

    expect(store.panelVisible.banner).toBe(false)
    expect(host.querySelector('.app-banner')).toBeNull()

    ;(host.querySelector('.banner-toggle') as HTMLButtonElement).click()
    await nextTick()
    expect(host.querySelector('.app-banner')).not.toBeNull()

    app.unmount()
  })

  it('collapses inspector and export sections from their headings', async () => {
    const { host, app, store } = mountApp()
    await store.render()
    store.selectInspectorObject('frame', false)
    await nextTick()

    const toggles = [...host.querySelectorAll('.section-toggle')] as HTMLButtonElement[]
    expect(toggles.length).toBeGreaterThanOrEqual(3)
    const transformToggle = toggles.find((button) => button.textContent?.includes('Transform'))
    expect(transformToggle).toBeDefined()
    expect(transformToggle!.getAttribute('aria-expanded')).toBe('true')

    transformToggle!.click()
    await nextTick()
    expect(transformToggle!.getAttribute('aria-expanded')).toBe('false')

    const exportToggle = [...host.querySelectorAll('.section-toggle')].find((button) =>
      button.textContent?.includes('2. Format'),
    ) as HTMLButtonElement
    expect(exportToggle).toBeDefined()
    exportToggle.click()
    await nextTick()
    expect(exportToggle.getAttribute('aria-expanded')).toBe('false')

    app.unmount()
  })

  it('hides the path toolbar and the status bar without touching the canvas', async () => {
    const { host, app, store } = mountApp()
    await nextTick()

    expect(host.querySelector('.path-toolbar')).not.toBeNull()
    expect(host.querySelector('.status-bar')).not.toBeNull()

    ;(host.querySelector('[aria-label="Path toolbar: Hide"]') as HTMLButtonElement).click()
    ;(host.querySelector('[aria-label="Status bar: Hide"]') as HTMLButtonElement).click()
    await nextTick()

    expect(store.panelVisible.toolbar).toBe(false)
    expect(store.panelVisible.statusbar).toBe(false)
    expect((host.querySelector('.path-toolbar') as HTMLElement).style.display).toBe('none')
    expect((host.querySelector('.status-bar') as HTMLElement).style.display).toBe('none')
    expect(host.querySelector('.canvas-viewport')).not.toBeNull()

    app.unmount()
  })
})
