import { describe, expect, it } from 'vitest'
import {
  INSPECTOR_FIELDS,
  dimensionRatio,
  fieldApplies,
  getFieldByKey,
  resolveFieldState,
} from './fields'
import type { NumberField } from './fields'
import type { CircleObject, EllipseObject, RectangleObject } from '@/types/scene'

const rect = (overrides: Partial<RectangleObject> = {}): RectangleObject => ({
  id: 'rect-1',
  type: 'rect',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  ...overrides,
})

const circle = (overrides: Partial<CircleObject> = {}): CircleObject => ({
  id: 'circle-1',
  type: 'circle',
  cx: 30,
  cy: 40,
  radius: 25,
  ...overrides,
})

const ellipse = (overrides: Partial<EllipseObject> = {}): EllipseObject => ({
  id: 'ellipse-1',
  type: 'ellipse',
  cx: 0,
  cy: 0,
  rx: 40,
  ry: 20,
  ...overrides,
})

const numberField = (key: string): NumberField => getFieldByKey(key) as NumberField

describe('inspector field registry', () => {
  it('covers transform, appearance and shape sections', () => {
    const sections = new Set(INSPECTOR_FIELDS.map((field) => field.section))
    expect(sections).toEqual(new Set(['Transform', 'Appearance', 'Shape']))
    expect(getFieldByKey('fill')?.kind).toBe('color')
    expect(getFieldByKey('radius')?.types).toEqual(['circle'])
    expect(getFieldByKey('rx')?.types).toEqual(['rect'])
  })

  it('reads and writes position for each geometry family', () => {
    const posX = numberField('posX')
    const posY = numberField('posY')
    expect(posX.read(rect())).toBe(10)
    expect(posX.read(circle())).toBe(30)
    expect(posX.write(circle(), 99)).toEqual({ cx: 99 })
    expect(posY.write(rect(), 77)).toEqual({ y: 77 })
  })

  it('derives dimensions from radius for circles and radii for ellipses', () => {
    const width = numberField('width')
    const height = numberField('height')
    expect(width.read(rect())).toBe(100)
    expect(width.read(circle())).toBe(50)
    expect(height.read(ellipse())).toBe(40)
    expect(width.write(circle(), 80)).toEqual({ radius: 40 })
    expect(height.write(ellipse(), 10)).toEqual({ ry: 5 })
  })

  it('patches transform fields without dropping sibling transform values', () => {
    const rotation = numberField('rotation')
    const patch = rotation.write(rect({ transform: { rotate: 12, scaleX: 2 } }), 45) as {
      transform: { rotate: number; scaleX: number }
    }
    expect(patch.transform).toEqual({ rotate: 45, scaleX: 2 })
  })

  it('only exposes fields supported by the selected object types', () => {
    const keys = INSPECTOR_FIELDS.filter((field) => fieldApplies(field, circle())).map((field) => field.key)
    expect(keys).toContain('radius')
    expect(keys).toContain('fill')
    expect(keys).not.toContain('rx')
    expect(keys).not.toContain('content')
  })

  it('resolves shared values and flags mixed selections', () => {
    const shared = resolveFieldState(numberField('posX'), [circle({ cx: 10 }), circle({ cx: 10 })])
    expect(shared.value).toBe(10)
    expect(shared.mixed).toBe(false)

    const mixed = resolveFieldState(numberField('posX'), [circle({ cx: 10 }), circle({ cx: 20 })])
    expect(mixed.value).toBeNull()
    expect(mixed.mixed).toBe(true)

    const unsupported = resolveFieldState(numberField('radius'), [rect()])
    expect(unsupported.supportedCount).toBe(0)
    expect(unsupported.value).toBeNull()
  })

  it('computes aspect ratios used for dimension locking', () => {
    expect(dimensionRatio(rect({ width: 200, height: 100 }))).toBe(2)
    expect(dimensionRatio(ellipse({ rx: 30, ry: 10 }))).toBe(3)
    expect(dimensionRatio(circle())).toBe(1)
    expect(dimensionRatio(rect({ height: 0 }))).toBeNull()
  })
})
