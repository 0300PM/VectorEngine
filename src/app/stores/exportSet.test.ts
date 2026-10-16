import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useExportSetStore } from './exportSet'

describe('export set store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts from the first built-in preset and plans against the sample document', () => {
    const store = useExportSetStore()
    expect(store.selectedPresetId).toBe('web-logo')
    expect(store.variants).toHaveLength(5)
    expect(store.plan.outputs.map((output) => output.fileName)).toEqual([
      'sample-scene.svg',
      'sample-scene-256.png',
      'sample-scene-512.png',
      'sample-scene-1024.png',
      'sample-scene.pdf',
    ])
    expect(store.plan.ok).toBe(true)
  })

  it('edits variants and keeps sizes consistent with the format', () => {
    const store = useExportSetStore()
    store.selectPreset('raster-scales')
    expect(store.variants.map((variant) => variant.suffix)).toEqual(['', '@2x', '@3x'])
    const [first, second] = store.variants
    store.updateVariant(first!.id, { format: 'ico' })
    expect(store.variants[0]?.size).toEqual({ mode: 'sizes', sizes: [16, 32, 48] })
    store.updateVariant(first!.id, { format: 'png' })
    expect(store.variants[0]?.size).toEqual({ mode: 'original' })
    store.moveVariant(second!.id, -1)
    expect(store.variants[0]?.id).toBe(second!.id)
    store.removeVariant(second!.id)
    store.addVariant('svg')
    expect(store.variants.at(-1)?.format).toBe('svg')
    expect(store.variants.at(-1)?.suffix).toBe('-3')
  })

  it('reports plan problems for an empty node scope and saves custom presets', () => {
    const store = useExportSetStore()
    store.scopeKind = 'nodes'
    store.scopeNodeIds = []
    expect(store.plan.ok).toBe(false)
    expect(store.plan.outputs[0]?.problems).toContain('empty_scope')
    store.scopeNodeIds = [store.nodeOptions[0]!.value]
    expect(store.plan.outputs[0]?.problems).toEqual([])

    store.savePreset('  Mine ')
    expect(store.customPresets.map((preset) => preset.name)).toEqual(['Mine'])
    expect(store.selectedPreset?.name).toBe('Mine')
    store.deletePreset(store.selectedPresetId)
    expect(store.customPresets).toEqual([])
    expect(store.selectedPresetId).toBe('web-logo')
  })
})
