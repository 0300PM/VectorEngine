import { describe, expect, it } from 'vitest'
import { alignObjects, applyPlacements, distributeObjects, type ScenePropertySetter } from '../align'
import { identityMatrix } from '@/export/bounds'
import type { SceneObject } from '@/types/scene'

const rect = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  over: Partial<SceneObject> = {},
): SceneObject =>
  ({
    id,
    type: 'rect',
    x,
    y,
    width,
    height,
    ...over,
  }) as SceneObject

const pair = (): [SceneObject, SceneObject] => [rect('a', 0, 0, 100, 100), rect('b', 200, 50, 100, 100)]

const translated = (object: SceneObject, axis: 'translateX' | 'translateY'): number =>
  object.transform?.[axis] ?? 0

describe('align', () => {
  it('aligns left edges to the selection bounds', () => {
    const [a, b] = pair()
    alignObjects([a, b], 'left', 'selection')
    expect(translated(a, 'translateX')).toBe(0)
    expect(translated(b, 'translateX')).toBe(-200)
  })

  it('aligns right edges to the selection bounds', () => {
    const [a, b] = pair()
    alignObjects([a, b], 'right', 'selection')
    expect(translated(a, 'translateX')).toBe(200)
    expect(translated(b, 'translateX')).toBe(0)
  })

  it('aligns centres vertically to the selection bounds', () => {
    const [a, b] = pair()
    alignObjects([a, b], 'center-h', 'selection')
    expect(translated(a, 'translateX')).toBe(100)
    expect(translated(b, 'translateX')).toBe(-100)
  })

  it('aligns top edges to the selection bounds', () => {
    const [a, b] = pair()
    alignObjects([a, b], 'top', 'selection')
    expect(translated(a, 'translateY')).toBe(0)
    expect(translated(b, 'translateY')).toBe(-50)
  })

  it('aligns bottom edges to the selection bounds', () => {
    const [a, b] = pair()
    alignObjects([a, b], 'bottom', 'selection')
    expect(translated(a, 'translateY')).toBe(50)
    expect(translated(b, 'translateY')).toBe(0)
  })

  it('aligns horizontal centres to the selection bounds', () => {
    const [a, b] = pair()
    alignObjects([a, b], 'center-v', 'selection')
    expect(translated(a, 'translateY')).toBe(25)
    expect(translated(b, 'translateY')).toBe(-25)
  })

  it('aligns to the document bounds', () => {
    const [a, b] = pair()
    alignObjects([a, b], 'right', 'document', { documentBounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 } })
    expect(translated(a, 'translateX')).toBe(900)
    expect(translated(b, 'translateX')).toBe(700)
  })

  it('aligns to a key object', () => {
    const [a, b] = pair()
    const key = rect('key', 500, 0, 100, 100)
    alignObjects([a, b], 'right', 'key', { key })
    expect(translated(a, 'translateX')).toBe(500)
    expect(translated(b, 'translateX')).toBe(300)
  })

  it('matches width and height to the first object', () => {
    const a = rect('a', 0, 0, 100, 60)
    const b = rect('b', 200, 0, 40, 20)
    alignObjects([a, b], 'left', 'selection', { matchWidth: true, matchHeight: true })
    expect((b as { width: number }).width).toBe(100)
    expect((b as { height: number }).height).toBe(60)
  })

  it('returns no placements for an empty selection', () => {
    expect(alignObjects([], 'left', 'selection')).toEqual([])
  })

  it('reports placements that match the resulting transforms', () => {
    const [a, b] = pair()
    const placements = alignObjects([a, b], 'left', 'selection')
    expect(placements).toHaveLength(2)
    expect(placements[0]?.deltaX).toBe(0)
    expect(placements[1]?.deltaX).toBe(-200)
  })
})

describe('distribute', () => {
  const three = (): [SceneObject, SceneObject, SceneObject] => [
    rect('a', 0, 0, 100, 100),
    rect('b', 0, 100, 100, 100),
    rect('c', 0, 400, 100, 100),
  ]

  it('spreads three objects evenly', () => {
    const [a, b, c] = three()
    distributeObjects([a, b, c], 'y')
    expect(translated(a, 'translateY')).toBe(0)
    expect(translated(b, 'translateY')).toBe(100)
    expect(translated(c, 'translateY')).toBe(0)
  })

  it('keeps the first and last objects in place', () => {
    const [a, , c] = three()
    distributeObjects([a, rect('b', 0, 100, 100, 100), c], 'y')
    expect(translated(a, 'translateY')).toBe(0)
    expect(translated(c, 'translateY')).toBe(0)
  })

  it('distributes horizontally', () => {
    const objects = [
      rect('a', 0, 0, 100, 100),
      rect('b', 200, 0, 100, 100),
      rect('c', 400, 0, 100, 100),
    ]
    distributeObjects(objects, 'x')
    expect(translated(objects[0]!, 'translateX')).toBe(0)
    expect(translated(objects[1]!, 'translateX')).toBe(0)
    expect(translated(objects[2]!, 'translateX')).toBe(0)
  })

  it('does nothing for fewer than three objects', () => {
    const objects = [rect('a', 0, 0, 100, 100), rect('b', 0, 150, 100, 100)]
    expect(distributeObjects(objects, 'y')).toEqual([])
    expect(objects[1]?.transform).toBeUndefined()
  })
})

describe('placements in parent space', () => {
  it('converts a scene delta through the parent matrix', () => {
    const object = rect('a', 0, 0, 10, 10)
    const rotated = { a: 0, b: -1, c: 1, d: 0, e: 0, f: 0 }
    const setProperty: ScenePropertySetter = (target, key, value) => {
      ;(target as unknown as Record<string, unknown>)[key as string] = value
    }
    applyPlacements([object], [{ object, deltaX: 10, deltaY: 0 }], setProperty, () => rotated)
    expect(object.transform?.translateY).toBe(10)
    expect(object.transform?.translateX).toBe(0)
  })

  it('uses the identity matrix by default', () => {
    const object = rect('a', 0, 0, 10, 10)
    const setProperty: ScenePropertySetter = (target, key, value) => {
      ;(target as unknown as Record<string, unknown>)[key as string] = value
    }
    applyPlacements([object], [{ object, deltaX: 5, deltaY: 7 }], setProperty, () => identityMatrix())
    expect(object.transform).toEqual({ translateX: 5, translateY: 7 })
  })
})
