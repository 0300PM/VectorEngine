import { describe, expect, it } from 'vitest'
import {
  candidatesForBounds,
  gridLines,
  snapDocumentPoint,
  snapToGrid,
  type SnapCandidates,
  type SnapSettings,
} from '../snap'
import { objectBounds } from '../hitTest'
import type { SceneObject } from '@/types/scene'

const rect = (id: string, x: number, y: number, width: number, height: number): SceneObject => ({
  id,
  type: 'rect',
  x,
  y,
  width,
  height,
})

const settingsWith = (overrides: Partial<SnapSettings> = {}): SnapSettings => ({
  enabled: true,
  grid: false,
  guides: false,
  edges: false,
  centers: false,
  points: false,
  tolerance: 6,
  ...overrides,
})

const gridCandidates = (spacing: number, from = -1000, to = 1000): SnapCandidates => {
  const lines = gridLines(from, to, spacing)
  return { gridX: lines, gridY: lines }
}

describe('grid', () => {
  it('snaps to the nearest grid intersection', () => {
    const result = snapDocumentPoint(
      { x: 12, y: 34 },
      settingsWith({ grid: true, tolerance: 10 }),
      1,
      gridCandidates(20),
    )
    expect(result.point).toEqual({ x: 20, y: 40 })
    expect(result.matched).toBe(true)
  })

  it('leaves the point untouched outside the tolerance', () => {
    const result = snapDocumentPoint({ x: 12, y: 34 }, settingsWith({ grid: true }), 1, gridCandidates(20))
    expect(result.point).toEqual({ x: 12, y: 34 })
    expect(result.matched).toBe(false)
  })

  it('snaps to the nearest multiple', () => {
    expect(snapToGrid({ x: 13, y: 34 }, 20)).toEqual({ x: 20, y: 40 })
  })

  it('leaves the point untouched on a disabled grid', () => {
    expect(snapToGrid({ x: 12, y: 34 }, 0)).toEqual({ x: 12, y: 34 })
  })

  it('generates grid lines across a range', () => {
    expect(gridLines(0, 105, 20)).toEqual([0, 20, 40, 60, 80, 100])
    expect(gridLines(-5, 5, 20)).toEqual([-20, 0])
    expect(gridLines(0, 10, 0)).toEqual([])
  })
})

describe('guides', () => {
  it('snaps to a guide', () => {
    const result = snapDocumentPoint(
      { x: 12, y: 25 },
      settingsWith({ guides: true, tolerance: 10 }),
      1,
      { guideX: [10.5], guideY: [20.5] },
    )
    expect(result.point).toEqual({ x: 10.5, y: 20.5 })
  })
})

describe('edges and centres', () => {
  const scene = [rect('a', 0, 0, 100, 100), rect('b', 200, 0, 100, 100)]
  const candidates = candidatesForBounds(scene)

  it('collects candidate values from object bounds', () => {
    expect(candidates.edgeX).toEqual([0, 100, 200, 300])
    expect(candidates.centerX).toEqual([50, 250])
    expect(candidates.edgeY).toEqual([0, 100, 0, 100])
    expect(candidates.centerY).toEqual([50, 50])
  })

  it('snaps to the nearest edge', () => {
    const result = snapDocumentPoint({ x: 102, y: 500 }, settingsWith({ edges: true }), 1, candidates)
    expect(result.point).toEqual({ x: 100, y: 500 })
  })

  it('snaps to the nearest centre', () => {
    const result = snapDocumentPoint({ x: 52, y: 500 }, settingsWith({ centers: true }), 1, candidates)
    expect(result.point).toEqual({ x: 50, y: 500 })
  })

  it('ignores candidate sources that are switched off', () => {
    const result = snapDocumentPoint({ x: 102, y: 500 }, settingsWith({ centers: true }), 1, candidates)
    expect(result.point).toEqual({ x: 102, y: 500 })
  })
})

describe('points', () => {
  it('snaps to object reference points', () => {
    const result = snapDocumentPoint({ x: 11, y: 11 }, settingsWith({ points: true }), 1, {
      points: [{ x: 10, y: 10 }],
    })
    expect(result.point).toEqual({ x: 10, y: 10 })
  })
})

describe('tolerance and scale', () => {
  const candidates = candidatesForBounds([rect('a', 0, 0, 100, 100)])
  const settings = settingsWith({ edges: true })

  it('scales the tolerance with the document scale', () => {
    expect(snapDocumentPoint({ x: 102.9, y: 0 }, settings, 1, candidates).point).toEqual({ x: 100, y: 0 })
    expect(snapDocumentPoint({ x: 102.9, y: 0 }, settings, 4, candidates).point).toEqual({ x: 102.9, y: 0 })
    expect(snapDocumentPoint({ x: 100.4, y: 0 }, settings, 4, candidates).point).toEqual({ x: 100, y: 0 })
  })

  it('does nothing when snapping is disabled', () => {
    const result = snapDocumentPoint({ x: 102, y: 0 }, settingsWith({ enabled: false, edges: true }), 1, candidates)
    expect(result).toEqual({ point: { x: 102, y: 0 }, matched: false })
  })
})

describe('object bounds used as snap sources', () => {
  it('respects transforms', () => {
    const moved = rect('a', 0, 0, 100, 100)
    moved.transform = { rotate: 0, translateX: 50, translateY: 0, originX: 0, originY: 0 }
    expect(objectBounds(moved)).toEqual({ minX: 50, minY: 0, maxX: 150, maxY: 100 })
  })
})
