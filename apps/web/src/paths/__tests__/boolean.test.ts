import { describe, expect, it } from 'vitest'
import { isValidPathData } from '@/engine/pathValidator'
import { serializePathModel } from '../parser'
import { booleanArea, booleanOnModels, polygonsToPathModel, type BooleanOperation } from '../boolean'
import { createPolygonPath, createRectanglePath, createStarPath } from '../shapes'

const squareA = () => createRectanglePath(0, 0, 100, 100)
const squareB = () => createRectanglePath(50, 50, 100, 100)

const run = (operation: BooleanOperation) => booleanOnModels(operation, squareA(), squareB())

const area = (polygons: ReturnType<typeof booleanOnModels>['polygons']): number =>
  booleanArea(polygons)

describe('boolean operations', () => {
  it('unions overlapping shapes', () => {
    const result = run('union')
    expect(result.supported).toBe(true)
    expect(area(result.polygons)).toBeCloseTo(17500, 0)
  })

  it('intersects overlapping shapes', () => {
    const result = run('intersect')
    expect(area(result.polygons)).toBeCloseTo(2500, 0)
  })

  it('subtracts overlapping shapes', () => {
    const result = run('subtract')
    expect(area(result.polygons)).toBeCloseTo(7500, 0)
  })

  it('excludes overlapping shapes', () => {
    const result = run('exclude')
    expect(area(result.polygons)).toBeCloseTo(15000, 0)
  })

  it('unions disjoint shapes', () => {
    const disjoint = createRectanglePath(500, 500, 10, 10)
    const result = booleanOnModels('union', squareA(), disjoint)
    expect(area(result.polygons)).toBeCloseTo(10100, 0)
  })

  it('returns nothing for disjoint intersection', () => {
    const disjoint = createRectanglePath(500, 500, 10, 10)
    const result = booleanOnModels('intersect', squareA(), disjoint)
    expect(area(result.polygons)).toBeCloseTo(0, 0)
  })

  it('cuts a hole when one shape is contained', () => {
    const inner = createRectanglePath(20, 20, 60, 60)
    const result = booleanOnModels('subtract', squareA(), inner)
    expect(area(result.polygons)).toBeCloseTo(6400, 0)
  })

  it('requires closed shapes', () => {
    const open = createPolygonPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ])
    const result = booleanOnModels('union', open, squareB())
    expect(result.supported).toBe(false)
    expect(result.reason).toContain('zamknięte')
  })

  it('produces editable path data', () => {
    const result = run('union')
    const model = polygonsToPathModel(result.polygons)
    expect(model.subpaths.length).toBeGreaterThan(0)
    for (const subpath of model.subpaths) {
      expect(subpath.closed).toBe(true)
    }
    expect(isValidPathData(serializePathModel(model))).toBe(true)
  })

  it('handles stars and concave shapes', () => {
    const star = createStarPath({ x: 50, y: 50 }, 60, 25, 5)
    const result = booleanOnModels('union', star, squareA())
    expect(result.supported).toBe(true)
    expect(area(result.polygons)).toBeGreaterThan(0)
  })

  it('is stable across repeated evaluations', () => {
    const first = area(run('subtract').polygons)
    const second = area(run('subtract').polygons)
    expect(first).toBeCloseTo(second, 6)
  })
})
