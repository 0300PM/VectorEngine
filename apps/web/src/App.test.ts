import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import App from './App.vue'

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
    expect(text).toContain('Narzędzia ścieżek wektorowych')
    expect(host.querySelector('.preview-column')).not.toBeNull()

    app.unmount()
  })
})
