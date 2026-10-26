import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { findObjectsById } from '@/inspector/sceneTree'
import { createRectanglePath } from '@/paths/shapes'
import { useEngineStore } from '@/stores/engine'
import type { CircleObject, RectangleObject, SceneObject } from '@/types/scene'

type Store = ReturnType<typeof useEngineStore>

const rawObject = (store: Store, id: string): SceneObject | undefined => {
  if (!store.scene) {
    return undefined
  }
  return findObjectsById(store.scene, [id])[0]
}

const circleOf = (store: Store, id: string): CircleObject | undefined =>
  rawObject(store, id) as CircleObject | undefined

const rectOf = (store: Store, id: string): RectangleObject | undefined =>
  rawObject(store, id) as RectangleObject | undefined

describe('engine store inspector commands', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies patches to selected objects and syncs the source', async () => {
    const store = useEngineStore()
    await store.render()
    expect(circleOf(store, 'core')?.cx).toBe(600)

    store.applyObjectPatch(['core'], () => ({ cx: 123 }))
    expect(circleOf(store, 'core')?.cx).toBe(123)
    expect(store.source).toContain('"cx": 123')
  })

  it('supports undo and redo of committed inspector edits', async () => {
    const store = useEngineStore()
    await store.render()

    store.beginInspectorEdit()
    store.applyObjectPatch(['core'], () => ({ cx: 500 }))
    store.commitInspectorEdit()

    expect(store.canUndo).toBe(true)
    expect(circleOf(store, 'core')?.cx).toBe(500)

    store.undo()
    expect(circleOf(store, 'core')?.cx).toBe(600)
    expect(store.canRedo).toBe(true)

    store.redo()
    expect(circleOf(store, 'core')?.cx).toBe(500)
    expect(store.canUndo).toBe(true)
  })

  it('ignores undo when the history is empty', async () => {
    const store = useEngineStore()
    await store.render()
    expect(store.canUndo).toBe(false)
    store.undo()
    expect(circleOf(store, 'core')?.cx).toBe(600)
  })

  it('applies a patch to every object in a multi-selection', async () => {
    const store = useEngineStore()
    await store.render()
    store.selectedObjectIds = ['core', 'core-ring']

    store.applyObjectPatch(store.selectedObjectIds, () => ({ cy: 111 }))

    const values = ['core', 'core-ring'].map((id) => circleOf(store, id)?.cy)
    expect(values).toEqual([111, 111])
  })

  it('toggles layer visibility through the inspector', async () => {
    const store = useEngineStore()
    await store.render()
    expect(rawObject(store, 'guide-grid')?.visible).toBe(false)

    store.toggleInspectorVisibility('guide-grid')
    expect(rawObject(store, 'guide-grid')?.visible).toBe(true)

    store.toggleInspectorVisibility('guide-grid')
    expect(rawObject(store, 'guide-grid')?.visible).toBe(false)
  })

  it('manages inspector selection including additive toggling', async () => {
    const store = useEngineStore()
    await store.render()

    store.selectInspectorObject('core', false)
    expect(store.selectedObjectIds).toEqual(['core'])

    store.selectInspectorObject('core-ring', true)
    expect(store.selectedObjectIds).toEqual(['core', 'core-ring'])

    store.selectInspectorObject('core', true)
    expect(store.selectedObjectIds).toEqual(['core-ring'])
  })

  it('clears history when the source is replaced externally', async () => {
    const store = useEngineStore()
    await store.render()

    store.beginInspectorEdit()
    store.applyObjectPatch(['core'], () => ({ cx: 500 }))
    store.commitInspectorEdit()
    expect(store.canUndo).toBe(true)

    store.setSource(store.source.replace('"cx": 500', '"cx": 600'))
    expect(store.canUndo).toBe(false)
  })

  it('keeps rectangle geometry intact after an inspector patch', async () => {
    const store = useEngineStore()
    await store.render()
    expect(rectOf(store, 'frame')?.width).toBe(1040)

    store.beginInspectorEdit()
    store.applyObjectPatch(['frame'], () => ({ width: 900 }))
    store.commitInspectorEdit()

    const frame = rectOf(store, 'frame')
    expect(frame?.width).toBe(900)
    expect(frame?.height).toBe(640)
  })
})

describe('engine store path tools', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds a path object, selects it and enters node editing', async () => {
    const store = useEngineStore()
    await store.render()

    const object = store.addPathFromModel(createRectanglePath(0, 0, 50, 50), 'Test shape')
    expect(object?.id).toBe('path-1')
    expect(store.selectedObjectIds).toEqual(['path-1'])
    expect(store.nodeEditing).toBe(true)
    expect(store.pathTool).toBe('select')
  })

  it('applies node edits to the selected path and records history', async () => {
    const store = useEngineStore()
    await store.render()
    store.addPathFromModel(createRectanglePath(0, 0, 50, 50), 'Test shape')

    const applied = store.applyPathCommandToSelection({
      kind: 'move-node',
      subpath: 0,
      node: 1,
      position: { x: 5, y: 5 },
    })
    expect(applied).toBe(true)
    expect(store.canUndo).toBe(true)
  })

  it('refuses node edits without a single selected path', async () => {
    const store = useEngineStore()
    await store.render()
    expect(store.applyPathCommandToSelection({ kind: 'reverse', subpath: 0 })).toBe(false)
  })

  it('refuses node edits on non-path objects', async () => {
    const store = useEngineStore()
    await store.render()
    store.selectInspectorObject('core', false)
    expect(store.applyPathCommandToSelection({ kind: 'reverse', subpath: 0 })).toBe(false)
  })

  it('builds a boolean result from two closed paths', async () => {
    const store = useEngineStore()
    await store.render()
    const first = store.addPathFromModel(createRectanglePath(0, 0, 100, 100), 'A')!
    const second = store.addPathFromModel(createRectanglePath(50, 50, 100, 100), 'B')!
    store.setSelectedObjectIds([first.id, second.id])

    expect(store.applyBooleanToSelection('union')).toBe(true)
    expect(store.selectedObjectIds).toHaveLength(1)
    expect(store.selectedObjectIds[0]).not.toBe(first.id)
    expect(store.selectedObjectIds[0]).not.toBe(second.id)
  })

  it('reports why a boolean operation is unavailable', async () => {
    const store = useEngineStore()
    await store.render()
    store.addPathFromModel(createRectanglePath(0, 0, 100, 100), 'A')

    expect(store.applyBooleanToSelection('union')).toBe(false)
    expect(store.pathNotice).toContain('two paths')
  })

  it('reports why open shapes cannot be combined', async () => {
    const store = useEngineStore()
    await store.render()
    const open = {
      id: 'open-line',
      type: 'path' as const,
      d: 'M 0 0 L 50 0',
    }
    store.appendSceneObject(open)
    const closed = store.addPathFromModel(createRectanglePath(0, 0, 50, 50), 'Box')!
    store.setSelectedObjectIds([open.id, closed.id])

    expect(store.applyBooleanToSelection('intersect')).toBe(false)
    expect(store.pathNotice).toContain('Closed shapes')
  })

  it('removes selected paths', async () => {
    const store = useEngineStore()
    await store.render()
    store.addPathFromModel(createRectanglePath(0, 0, 50, 50), 'Test shape')

    expect(store.removeSceneObject('path-1')).toBe(true)
    expect(store.selectedObjectIds).toEqual([])
    expect(store.removeSceneObject('path-1')).toBe(false)
  })

  it('switches the path tool and node editing together', async () => {
    const store = useEngineStore()
    await store.render()

    store.setPathTool('pen')
    expect(store.pathTool).toBe('pen')
    expect(store.nodeEditing).toBe(false)

    store.setNodeEditing(true)
    expect(store.nodeEditing).toBe(true)
  })
})

describe('workspace panel visibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with every panel visible', async () => {
    const store = useEngineStore()
    await store.render()
    expect(store.panelVisible).toEqual({
      json: true,
      properties: true,
      export: true,
      toolbar: true,
      statusbar: true,
      banner: true,
    })
  })

  it('starts with every collapsible column expanded', async () => {
    const store = useEngineStore()
    await store.render()
    expect(store.panelCollapsed).toEqual({ json: false, properties: false, export: false })
  })

  it('collapses a column and reveals it again on expand', async () => {
    const store = useEngineStore()
    await store.render()

    store.setPanelCollapsed('json', true)
    expect(store.panelCollapsed.json).toBe(true)

    store.setPanelCollapsed('json', false)
    expect(store.panelCollapsed.json).toBe(false)

    store.togglePanelCollapsed('export')
    expect(store.panelCollapsed.export).toBe(true)
    store.setPanelVisible('export', false)
    store.togglePanelCollapsed('export')
    expect(store.panelCollapsed.export).toBe(false)
    expect(store.panelVisible.export).toBe(true)
  })

  it('collapses and expands every column at once', async () => {
    const store = useEngineStore()
    await store.render()

    store.collapsePanels()
    expect(store.panelCollapsed).toEqual({ json: true, properties: true, export: true })

    store.expandPanels()
    expect(store.panelCollapsed).toEqual({ json: false, properties: false, export: false })
  })

  it('dismisses and restores the product banner', async () => {
    const store = useEngineStore()
    await store.render()
    expect(store.bannerVisible).toBe(true)

    store.dismissBanner()
    expect(store.bannerVisible).toBe(false)
    expect(store.panelVisible.banner).toBe(false)

    store.showBanner()
    expect(store.bannerVisible).toBe(true)
  })

  it('toggles and sets individual panels', async () => {
    const store = useEngineStore()
    await store.render()

    store.togglePanel('json')
    expect(store.panelVisible.json).toBe(false)

    store.setPanelVisible('properties', false)
    expect(store.panelVisible.properties).toBe(false)

    store.togglePanel('properties')
    expect(store.panelVisible.properties).toBe(true)

    store.setPanelVisible('export', true)
    expect(store.panelVisible.export).toBe(true)
  })

  it('persists the choice in local storage', async () => {
    const store = useEngineStore()
    await store.render()

    store.togglePanel('json')
    store.setPanelVisible('statusbar', false)
    await nextTick()

    expect(JSON.parse(localStorage.getItem('vector-engine.panels') ?? '{}')).toEqual({
      json: false,
      properties: true,
      export: true,
      toolbar: true,
      statusbar: false,
      banner: true,
    })
  })
})
