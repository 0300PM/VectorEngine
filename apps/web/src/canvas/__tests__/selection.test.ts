import { describe, expect, it } from 'vitest'
import {
  boundsToRect,
  marqueeFromPoints,
  selectAt,
  selectByMarquee,
  selectionBounds,
  toggleInSelection,
} from '../selection'
import type { RectangleObject, SceneObject } from '@/types/scene'

const rect = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  over: Partial<RectangleObject> = {},
): SceneObject => ({
  id,
  type: 'rect',
  x,
  y,
  width,
  height,
  ...over,
})

describe('marquee construction', () => {
  it('normalises reversed points', () => {
    const marquee = marqueeFromPoints({ x: 300, y: 200 }, { x: 100, y: 50 })
    expect(marquee).toEqual({ x: 100, y: 50, width: 200, height: 150 })
  })

  it('collapses to a zero size', () => {
    const marquee = marqueeFromPoints({ x: 100, y: 50 }, { x: 100, y: 50 })
    expect(marquee).toEqual({ x: 100, y: 50, width: 0, height: 0 })
  })
})

describe('marquee selection', () => {
  const scene = [
    rect('inside', 20, 20, 10, 10),
    rect('edge', 80, 80, 10, 10),
    rect('outside', 300, 300, 10, 10),
  ]

  it('selects objects fully inside the rectangle', () => {
    const ids = selectByMarquee(scene, { x: 0, y: 0, width: 100, height: 100 }, 'inside')
    expect(ids.sort()).toEqual(['edge', 'inside'])
  })

  it('selects objects intersecting the rectangle', () => {
    const ids = selectByMarquee(scene, { x: 0, y: 0, width: 100, height: 100 }, 'intersect')
    expect(ids.sort()).toEqual(['edge', 'inside'])
  })

  it('ignores objects outside the rectangle', () => {
    const ids = selectByMarquee(scene, { x: 0, y: 0, width: 100, height: 100 }, 'inside')
    expect(ids).not.toContain('outside')
  })

  it('can select only visible objects', () => {
    const hidden = [rect('inside', 20, 20, 10, 10, { visible: false }), rect('outside', 300, 300, 10, 10)]
    const ids = selectByMarquee(hidden, { x: 0, y: 0, width: 100, height: 100 }, 'inside', false)
    expect(ids).toEqual([])
  })

  it('can include hidden objects explicitly', () => {
    const hidden = [rect('inside', 20, 20, 10, 10, { visible: false })]
    const ids = selectByMarquee(hidden, { x: 0, y: 0, width: 100, height: 100 }, 'inside', true)
    expect(ids).toEqual(['inside'])
  })
})

describe('click selection', () => {
  const scene = [rect('a', 0, 0, 100, 100), rect('b', 200, 0, 100, 100)]

  it('selects a single object', () => {
    expect(selectAt(scene, { x: 50, y: 50 }, false, [])).toEqual(['a'])
  })

  it('adds to the selection with shift', () => {
    expect(selectAt(scene, { x: 50, y: 50 }, true, ['b'])).toEqual(['b', 'a'])
  })

  it('removes from the selection with shift', () => {
    expect(selectAt(scene, { x: 50, y: 50 }, true, ['a', 'b'])).toEqual(['b'])
  })

  it('replaces the selection without shift', () => {
    expect(selectAt(scene, { x: 50, y: 50 }, false, ['b'])).toEqual(['a'])
  })

  it('keeps the selection when nothing is hit and a modifier is held', () => {
    expect(selectAt(scene, { x: 500, y: 500 }, true, ['b'])).toEqual(['b'])
  })

  it('clears the selection when nothing is hit', () => {
    expect(selectAt(scene, { x: 500, y: 500 }, false, ['b'])).toEqual([])
  })
})

describe('selection helpers', () => {
  it('toggles an object in the selection', () => {
    expect(toggleInSelection(['a'], 'a')).toEqual([])
    expect(toggleInSelection([], 'a')).toEqual(['a'])
    expect(toggleInSelection(['b'], 'a')).toEqual(['b', 'a'])
  })

  it('converts bounds to a rectangle', () => {
    expect(boundsToRect({ minX: 10, minY: 20, maxX: 60, maxY: 80 })).toEqual({ x: 10, y: 20, width: 50, height: 60 })
  })

  it('computes bounds over a selection', () => {
    const objects = [rect('a', 0, 0, 100, 100), rect('b', 200, 50, 100, 100)]
    expect(selectionBounds(objects)).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 150 })
    expect(selectionBounds([])).toBeNull()
  })
})
