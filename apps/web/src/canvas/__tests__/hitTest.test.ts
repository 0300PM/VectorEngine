import { describe, expect, it } from 'vitest'
import {
  collectHitTargets,
  hitTestObject,
  hitTestScene,
  isSelectable,
  localBounds,
  objectBounds,
  sceneBounds,
} from '../hitTest'
import type {
  CircleObject,
  LineObject,
  PathObject,
  PolygonObject,
  RectangleObject,
  SceneObject,
  TextObject,
} from '@/types/scene'

const rect = (over: Partial<RectangleObject> = {}): SceneObject => ({
  id: 'rect',
  type: 'rect',
  x: 10,
  y: 10,
  width: 100,
  height: 50,
  ...over,
})

const circle = (over: Partial<CircleObject> = {}): SceneObject => ({
  id: 'circle',
  type: 'circle',
  cx: 60,
  cy: 35,
  radius: 20,
  ...over,
})

const line = (over: Partial<LineObject> = {}): SceneObject => ({
  id: 'line',
  type: 'line',
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 0,
  ...over,
})

const polygon = (over: Partial<PolygonObject> = {}): SceneObject => ({
  id: 'polygon',
  type: 'polygon',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 50, y: 80 },
  ],
  ...over,
})

const pathObject = (over: Partial<PathObject> = {}): SceneObject => ({
  id: 'path',
  type: 'path',
  d: 'M 0 0 L 100 0 L 100 100 Z',
  ...over,
})

const text = (over: Partial<TextObject> = {}): SceneObject => ({
  id: 'text',
  type: 'text',
  x: 0,
  y: 20,
  content: 'Hi',
  fontSize: 20,
  ...over,
})

describe('local bounds', () => {
  it('computes bounds for primitive shapes', () => {
    expect(localBounds(rect())).toEqual({ minX: 10, minY: 10, maxX: 110, maxY: 60 })
    expect(localBounds(circle())).toEqual({ minX: 40, minY: 15, maxX: 80, maxY: 55 })
    expect(localBounds(line())).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 0 })
  })

  it('merges group children', () => {
    const group: SceneObject = {
      id: 'group',
      type: 'group',
      children: [rect({ id: 'a' }), circle({ id: 'b' })],
    }
    expect(localBounds(group)).toEqual({ minX: 10, minY: 10, maxX: 110, maxY: 60 })
  })

  it('returns null for empty groups', () => {
    expect(localBounds({ id: 'g', type: 'group', children: [] })).toBeNull()
  })
})

describe('object bounds', () => {
  it('applies transforms', () => {
    const box = objectBounds(rect({ transform: { translateX: 100, translateY: -20 } }))
    expect(box).toEqual({ minX: 110, minY: -10, maxX: 210, maxY: 40 })
  })

  it('expands for stroke width', () => {
    const box = objectBounds(rect({ stroke: '#000', strokeWidth: 10 }))
    expect(box).toEqual({ minX: 5, minY: 5, maxX: 115, maxY: 65 })
  })

  it('merges a scene', () => {
    const box = sceneBounds([rect(), circle()])
    expect(box).toEqual({ minX: 10, minY: 10, maxX: 110, maxY: 60 })
  })

  it('returns null for an empty scene', () => {
    expect(sceneBounds([])).toBeNull()
  })
})

describe('hit testing', () => {
  it('hits inside a rectangle', () => {
    expect(hitTestObject(rect(), { x: 50, y: 30 })).toBe(true)
    expect(hitTestObject(rect(), { x: 5, y: 30 })).toBe(false)
  })

  it('hits inside a circle and ellipse', () => {
    expect(hitTestObject(circle(), { x: 60, y: 35 })).toBe(true)
    expect(hitTestObject(circle(), { x: 90, y: 35 })).toBe(false)

    const ellipse: SceneObject = { id: 'e', type: 'ellipse', cx: 0, cy: 0, rx: 50, ry: 10 }
    expect(hitTestObject(ellipse, { x: 40, y: 0 })).toBe(true)
    expect(hitTestObject(ellipse, { x: 0, y: 40 })).toBe(false)
  })

  it('hits along a line within the stroke tolerance', () => {
    expect(hitTestObject(line(), { x: 50, y: 2 })).toBe(true)
    expect(hitTestObject(line(), { x: 50, y: 30 })).toBe(false)
  })

  it('hits inside a polygon', () => {
    expect(hitTestObject(polygon(), { x: 50, y: 30 })).toBe(true)
    expect(hitTestObject(polygon(), { x: 50, y: 90 })).toBe(false)
  })

  it('hits inside a closed path and along an open path', () => {
    expect(hitTestObject(pathObject(), { x: 50, y: 50 })).toBe(true)
    expect(hitTestObject(pathObject(), { x: 150, y: 50 })).toBe(false)

    const open: SceneObject = { id: 'open', type: 'path', d: 'M 0 0 L 100 0' }
    expect(hitTestObject(open, { x: 50, y: 0 })).toBe(true)
    expect(hitTestObject(open, { x: 50, y: 40 })).toBe(false)
  })

  it('hits inside a text box', () => {
    expect(hitTestObject(text(), { x: 10, y: 10 })).toBe(true)
    expect(hitTestObject(text(), { x: -100, y: 10 })).toBe(false)
  })

  it('resolves transforms before testing', () => {
    const moved = rect({ transform: { translateX: 200, translateY: 300 } })
    expect(hitTestObject(moved, { x: 250, y: 330 })).toBe(true)
    expect(hitTestObject(moved, { x: 50, y: 30 })).toBe(false)
  })

  it('hits group children', () => {
    const group: SceneObject = {
      id: 'group',
      type: 'group',
      children: [rect({ id: 'a' })],
    }
    expect(hitTestObject(group, { x: 50, y: 30 })).toBe(true)
    expect(hitTestObject(group, { x: 200, y: 200 })).toBe(false)
  })
})

describe('scene hit testing', () => {
  it('returns the topmost object', () => {
    const scene = [rect({ id: 'bottom' }), rect({ id: 'top' })]
    expect(hitTestScene(scene, { x: 50, y: 30 })?.id).toBe('top')
  })

  it('skips hidden objects', () => {
    const scene = [rect({ id: 'hidden', visible: false }), rect({ id: 'visible' })]
    expect(hitTestScene(scene, { x: 50, y: 30 })?.id).toBe('visible')
  })

  it('can include hidden objects explicitly', () => {
    const scene = [rect({ id: 'hidden', visible: false })]
    expect(hitTestScene(scene, { x: 50, y: 30 }, true)?.id).toBe('hidden')
  })

  it('returns null when nothing is hit', () => {
    expect(hitTestScene([rect()], { x: 500, y: 500 })).toBeNull()
  })

  it('filters selectable targets', () => {
    const targets = collectHitTargets([rect(), rect({ id: 'b', visible: false })])
    expect(targets.map((object) => object.id)).toEqual(['rect'])
  })

  it('treats visible objects as selectable', () => {
    expect(isSelectable({ id: 'a', type: 'rect', x: 0, y: 0, width: 1, height: 1 }, false)).toBe(true)
    expect(isSelectable({ id: 'a', type: 'rect', x: 0, y: 0, width: 1, height: 1, visible: false }, false)).toBe(false)
  })
})
