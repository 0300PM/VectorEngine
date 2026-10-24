import { describe, expect, it } from 'vitest'
import { createGuide, guidesFromRect, hitGuide, moveGuide, nextGuideId, removeGuidesInRect } from '../guides'

describe('guides', () => {
  it('creates a guide', () => {
    expect(createGuide('v', 120, 'g1')).toEqual({ id: 'g1', orientation: 'v', position: 120 })
  })

  it('derives guides from a rectangle', () => {
    const guides = guidesFromRect({ x: 10, y: 20, width: 100, height: 40 }, 'sel')
    expect(guides).toEqual([
      { id: 'sel-v-min', orientation: 'v', position: 10 },
      { id: 'sel-v-center', orientation: 'v', position: 60 },
      { id: 'sel-v-max', orientation: 'v', position: 110 },
      { id: 'sel-h-min', orientation: 'h', position: 20 },
      { id: 'sel-h-center', orientation: 'h', position: 40 },
      { id: 'sel-h-max', orientation: 'h', position: 60 },
    ])
  })

  it('hits the closest guide within tolerance', () => {
    const guides = [createGuide('v', 100, 'a'), createGuide('v', 120, 'b'), createGuide('h', 40, 'c')]
    expect(hitGuide(guides, { x: 119, y: 0 }, 5)?.guide.id).toBe('b')
    expect(hitGuide(guides, { x: 500, y: 41 }, 5)?.guide.id).toBe('c')
    expect(hitGuide(guides, { x: 100, y: 10 }, 5)?.guide.id).toBe('a')
    expect(hitGuide(guides, { x: 500, y: 10 }, 5)).toBeNull()
    expect(hitGuide(guides, { x: 100, y: 10 }, 0)).toBeNull()
  })

  it('moves a guide', () => {
    expect(moveGuide(createGuide('v', 1, 'a'), 42)).toEqual({ id: 'a', orientation: 'v', position: 42 })
  })

  it('generates unique ids', () => {
    const guides = [createGuide('v', 10, 'guide-v-1'), createGuide('v', 20, 'guide-v-2')]
    expect(nextGuideId(guides, 'v')).toBe('guide-v-3')
    expect(nextGuideId([], 'h')).toBe('guide-h-1')
  })

  it('removes guides inside a rectangle', () => {
    const guides = [
      createGuide('v', 50, 'inside'),
      createGuide('v', 200, 'outside'),
      createGuide('h', 30, 'inside-h'),
      createGuide('h', 300, 'outside-h'),
    ]
    const kept = removeGuidesInRect(guides, { x: 0, y: 0, width: 100, height: 100 }, 1)
    expect(kept.map((guide) => guide.id)).toEqual(['outside', 'outside-h'])
  })
})
