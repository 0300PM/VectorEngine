import type { Point } from './point'

export type Matrix2D = {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
}

export type ScaleFactors = { readonly x: number; readonly y: number }

const SINGULAR_EPSILON = 1e-12

export const identityMatrix: Matrix2D = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })

export const translation = (x: number, y: number): Matrix2D => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: x,
  f: y,
})

export const scaling = (x: number, y: number = x): Matrix2D => ({
  a: x,
  b: 0,
  c: 0,
  d: y,
  e: 0,
  f: 0,
})

export const rotation = (radians: number): Matrix2D => {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

export const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180

export const multiply = (lhs: Matrix2D, rhs: Matrix2D): Matrix2D => ({
  a: lhs.a * rhs.a + lhs.c * rhs.b,
  b: lhs.b * rhs.a + lhs.d * rhs.b,
  c: lhs.a * rhs.c + lhs.c * rhs.d,
  d: lhs.b * rhs.c + lhs.d * rhs.d,
  e: lhs.a * rhs.e + lhs.c * rhs.f + lhs.e,
  f: lhs.b * rhs.e + lhs.d * rhs.f + lhs.f,
})

export const compose = (...matrices: readonly Matrix2D[]): Matrix2D =>
  matrices.reduce(multiply, identityMatrix)

export const determinant = (matrix: Matrix2D): number => matrix.a * matrix.d - matrix.b * matrix.c

export const invert = (matrix: Matrix2D): Matrix2D | undefined => {
  const det = determinant(matrix)
  if (Math.abs(det) < SINGULAR_EPSILON) {
    return undefined
  }
  const inverseDet = 1 / det
  return {
    a: matrix.d * inverseDet,
    b: -matrix.b * inverseDet,
    c: -matrix.c * inverseDet,
    d: matrix.a * inverseDet,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) * inverseDet,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) * inverseDet,
  }
}

export const applyToPoint = (matrix: Matrix2D, target: Point): Point => ({
  x: matrix.a * target.x + matrix.c * target.y + matrix.e,
  y: matrix.b * target.x + matrix.d * target.y + matrix.f,
})

export const scaleFactors = (matrix: Matrix2D): ScaleFactors => ({
  x: Math.hypot(matrix.a, matrix.b),
  y: Math.hypot(matrix.c, matrix.d),
})

export const isIdentity = (matrix: Matrix2D): boolean =>
  matrix.a === 1 &&
  matrix.b === 0 &&
  matrix.c === 0 &&
  matrix.d === 1 &&
  matrix.e === 0 &&
  matrix.f === 0

export const matricesEqual = (lhs: Matrix2D, rhs: Matrix2D, epsilon = 1e-9): boolean =>
  Math.abs(lhs.a - rhs.a) <= epsilon &&
  Math.abs(lhs.b - rhs.b) <= epsilon &&
  Math.abs(lhs.c - rhs.c) <= epsilon &&
  Math.abs(lhs.d - rhs.d) <= epsilon &&
  Math.abs(lhs.e - rhs.e) <= epsilon &&
  Math.abs(lhs.f - rhs.f) <= epsilon

export type TransformDescription = {
  readonly translate?: Point
  readonly scale?: Point
  readonly rotateDegrees?: number
  readonly origin?: Point
}

export const matrixFromTransform = ({
  translate = { x: 0, y: 0 },
  scale = { x: 1, y: 1 },
  rotateDegrees = 0,
  origin = { x: 0, y: 0 },
}: TransformDescription): Matrix2D =>
  compose(
    translation(translate.x, translate.y),
    translation(origin.x, origin.y),
    rotation(degreesToRadians(rotateDegrees)),
    scaling(scale.x, scale.y),
    translation(-origin.x, -origin.y),
  )
