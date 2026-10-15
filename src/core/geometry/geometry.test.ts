import { describe, expect, it } from 'vitest'
import {
  applyToPoint,
  compose,
  identityMatrix,
  invert,
  matricesEqual,
  matrixFromTransform,
  multiply,
  rotation,
  scaleFactors,
  scaling,
  translation,
} from './matrix'
import { ellipsePath, pathCoordinateCount, rectanglePath, transformPath } from './path'

describe('Matrix2D', () => {
  it('applies the right operand first when multiplying', () => {
    const matrix = multiply(translation(10, 0), scaling(2))
    expect(applyToPoint(matrix, { x: 1, y: 1 })).toEqual({ x: 12, y: 2 })
  })

  it('inverts affine transforms', () => {
    const matrix = compose(translation(5, -2), rotation(0.7), scaling(3, 0.5))
    const inverse = invert(matrix)
    expect(inverse).toBeDefined()
    expect(matricesEqual(multiply(matrix, inverse ?? identityMatrix), identityMatrix)).toBe(true)
    expect(invert(scaling(0, 1))).toBeUndefined()
  })

  it('reports per-axis scale factors', () => {
    const factors = scaleFactors(compose(rotation(Math.PI / 3), scaling(2, 0.5)))
    expect(factors.x).toBeCloseTo(2)
    expect(factors.y).toBeCloseTo(0.5)
  })

  it('rotates around an origin', () => {
    const matrix = matrixFromTransform({ rotateDegrees: 90, origin: { x: 10, y: 10 } })
    const point = applyToPoint(matrix, { x: 20, y: 10 })
    expect(point.x).toBeCloseTo(10)
    expect(point.y).toBeCloseTo(20)
  })
})

describe('paths', () => {
  it('builds closed rectangles with optional rounded corners', () => {
    const sharp = rectanglePath(0, 0, 10, 10)
    expect(sharp[0]).toEqual({ type: 'M', x: 0, y: 0 })
    expect(sharp.at(-1)).toEqual({ type: 'Z' })
    const rounded = rectanglePath(0, 0, 10, 10, 2)
    expect(rounded.some((command) => command.type === 'C')).toBe(true)
  })

  it('approximates ellipses with four cubic segments', () => {
    const commands = ellipsePath(0, 0, 10, 5)
    expect(commands.filter((command) => command.type === 'C')).toHaveLength(4)
    expect(commands.reduce((total, command) => total + pathCoordinateCount(command), 0)).toBe(26)
  })

  it('transforms every control point', () => {
    const transformed = transformPath(ellipsePath(0, 0, 1, 1), translation(5, 5))
    expect(transformed[0]).toEqual({ type: 'M', x: 6, y: 5 })
  })
})
