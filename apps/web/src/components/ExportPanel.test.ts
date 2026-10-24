import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { useEngineStore } from '@/stores/engine'
import ExportPanel from './ExportPanel.vue'
import PreviewPanel from './PreviewPanel.vue'

describe('ExportPanel 7-section UI, PreviewPanel backdrop independence, and Pinia store integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    if (!URL.createObjectURL) {
      URL.createObjectURL = () => 'blob:mock-preview'
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = () => {}
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    if (typeof ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    }
  })

  it('renders all 7 accessible export sections, isolates editor backdrop from export background, and switches custom dimensions cleanly', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useEngineStore()
    await store.render()
    await store.refreshExportPreview()

    const host = document.createElement('div')
    const app = createApp(ExportPanel)
    app.use(pinia)
    app.mount(host)
    await nextTick()

    const text = host.textContent ?? ''
    expect(text).toContain('1. Target')
    expect(text).toContain('2. Format')
    expect(text).toContain('3. Dimensions')
    expect(text).toContain('4. Background')
    expect(text).toContain('5. Advanced')
    expect(text).toContain('6. Preview')
    expect(text).toContain('7. Export')

    const previewHost = document.createElement('div')
    const previewApp = createApp(PreviewPanel, {
      svg: store.preview?.svg ?? null,
      width: 1200,
      height: 800,
      objectCount: store.objectCount,
      renderState: 'ready',
      stale: false,
      backdrop: store.editorBackdrop,
    })
    previewApp.mount(previewHost)
    await nextTick()
    expect(previewHost.textContent).toContain('Preview')

    store.editorBackdrop = 'dark'
    expect(store.backgroundMode).toBe('document')
    expect(store.activeBackground).toBe('document')

    store.backgroundMode = 'transparent'
    expect(store.editorBackdrop).toBe('dark')
    expect(store.activeBackground).toBe('transparent')

    store.setCustomWidth(600)
    expect(store.scaleMode).toBe('custom')
    expect(store.effectiveDimensions.width).toBe(600)
    expect(store.effectiveDimensions.height).toBe(400)

    store.lockAspectRatio = false
    store.setCustomHeight(250)
    expect(store.effectiveDimensions).toEqual({ width: 600, height: 250 })

    store.setPresetScale(4)
    expect(store.scaleMode).toBe('preset')
    expect(store.effectiveDimensions).toEqual({ width: 4800, height: 3200 })

    await store.refreshExportPreview()
    expect(store.exportPreview?.downscaled).toBe(true)
    expect(store.exportPreview?.previewWidth).toBeLessThanOrEqual(320)

    app.unmount()
    previewApp.unmount()
  })
})
