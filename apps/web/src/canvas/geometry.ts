import { applyMatrix, type AffineMatrix } from '@/export/bounds'
import type { Point } from '@/types/scene'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const rectFromBounds = (box: Bounds): Rect => ({
  x: box.minX,
  y: box.minY,
  width: box.maxX - box.minX,
  height: box.maxY - box.minY,
})

export const boundsFromRect = (rect: Rect): Bounds => ({
  minX: rect.x,
  minY: rect.y,
  maxX: rect.x + rect.width,
  maxY: rect.y + rect.height,
})

export const mergeBounds = (boxes: Bounds[]): Bounds | null => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const box of boxes) {
    minX = Math.min(minX, box.minX)
    minY = Math.min(minY, box.minY)
    maxX = Math.max(maxX, box.maxX)
    maxY = Math.max(maxY, box.maxY)
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

export const expandBounds = (box: Bounds, padding: number): Bounds => ({
  minX: box.minX - padding,
  minY: box.minY - padding,
  maxX: box.maxX + padding,
  maxY: box.maxY + padding,
})

export const isEmptyRect = (rect: Rect): boolean => rect.width <= 0 || rect.height <= 0

export const pointInRect = (point: Point, rect: Rect): boolean =>
  point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height

export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

export const rectContains = (outer: Rect, inner: Rect): boolean =>
  outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height

export const pointInPolygon = (point: Point, points: Point[]): boolean => {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!
    const b = points[j]!
    const crosses =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) {
      inside = !inside
    }
  }
  return inside
}

export const distanceToSegment = (point: Point, start: Point, end: Point): number => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < 1e-12) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t))
}

export const distanceToPolyline = (point: Point, points: Point[]): number => {
  if (points.length === 0) {
    return Number.POSITIVE_INFINITY
  }
  if (points.length === 1) {
    return Math.hypot(point.x - points[0]!.x, point.y - points[0]!.y)
  }
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length - 1; index += 1) {
    best = Math.min(best, distanceToSegment(point, points[index]!, points[index + 1]!))
  }
  return best
}

export const invertMatrix = (matrix: AffineMatrix): AffineMatrix | null => {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (Math.abs(determinant) < 1e-12) {
    return null
  }
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  }
}

export const transformBounds = (box: Bounds, matrix: AffineMatrix): Bounds => {
  const corners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ]
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const corner of corners) {
    const transformed = applyMatrix(matrix, corner)
    minX = Math.min(minX, transformed.x)
    minY = Math.min(minY, transformed.y)
    maxX = Math.max(maxX, transformed.x)
    maxY = Math.max(maxY, transformed.y)
  }
  return { minX, minY, maxX, maxY }
}

export const midpointOf = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
