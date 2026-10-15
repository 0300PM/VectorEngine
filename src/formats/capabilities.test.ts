import { describe, expect, it } from 'vitest'
import {
  createDefaultFormatRegistry,
  documentFeatures,
  rasterTarget,
  type FeatureSupport,
} from '@/formats'

const nonNative: Readonly<
  Record<string, Partial<Record<(typeof documentFeatures)[number], FeatureSupport>>>
> = {
  vex: { assets: 'converted' },
  'document-json': { assets: 'converted' },
  svg: {
    image: 'converted',
    layers: 'converted',
    hiddenLayers: 'converted',
    lockedLayers: 'converted',
    displayP3: 'converted',
    assets: 'converted',
    metadata: 'converted',
  },
  pdf: {
    text: 'converted',
    image: 'unsupported',
    groupOpacity: 'converted',
    layers: 'dropped',
    hiddenLayers: 'dropped',
    lockedLayers: 'dropped',
    displayP3: 'converted',
    assets: 'dropped',
  },
  png: {
    text: 'unsupported',
    image: 'unsupported',
    evenodd: 'converted',
    groupOpacity: 'converted',
    layers: 'dropped',
    hiddenLayers: 'dropped',
    lockedLayers: 'dropped',
    physicalUnits: 'converted',
    displayP3: 'converted',
    assets: 'dropped',
    metadata: 'dropped',
  },
  jpeg: {
    text: 'unsupported',
    image: 'unsupported',
    evenodd: 'converted',
    groupOpacity: 'converted',
    colorAlpha: 'dropped',
    transparentBackground: 'dropped',
    layers: 'dropped',
    hiddenLayers: 'dropped',
    lockedLayers: 'dropped',
    physicalUnits: 'converted',
    displayP3: 'converted',
    assets: 'dropped',
    metadata: 'dropped',
  },
}

describe('capability matrix (docs/FORMATS.md)', () => {
  const registry = createDefaultFormatRegistry()
  const targets = [
    ...registry.writers,
    rasterTarget('png'),
    rasterTarget('jpeg'),
    rasterTarget('webp'),
  ]

  it.each(targets.map((target) => [target.id, target] as const))(
    '%s matches the documented matrix',
    (id, target) => {
      const expected = nonNative[id === 'webp' ? 'png' : id]
      expect(expected, `missing documentation row for ${id}`).toBeDefined()
      for (const feature of documentFeatures) {
        expect(target.capabilities[feature], `${id}.${feature}`).toBe(
          expected?.[feature] ?? 'native',
        )
      }
    },
  )
})
