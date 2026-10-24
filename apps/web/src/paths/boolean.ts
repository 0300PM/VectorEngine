import {
  clipDifference,
  clipIntersection,
  clipUnion,
  clipXor,
  type MultiPolygon,
  type Pair,
  type Ring,
} from './clipping'
import { makeNode, type PathModel, type PathSubpath, type Point } from './model'
import { flattenToPolygons, hasClosedSubpath, type PolygonShape } from './flatten'

export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude'

export const BOOLEAN_LABELS: Record<BooleanOperation, string> = {
  union: 'Łączenie',
  subtract: 'Odejmowanie',
  intersect: 'Przecięcie',
  exclude: 'Wykluczanie',
}

export const toRing = (points: Point[]): Ring => points.map(({ x, y }) => [x, y] as Pair)

export const fromRing = (ring: Ring): Point[] => ring.map(([x, y]) => ({ x, y }))

const toGeometry = (polygons: PolygonShape[]): MultiPolygon =>
  polygons.map(
    (polygon) => [toRing(polygon.outer), ...polygon.holes.map(toRing)] as Ring[],
  )

const fromGeometry = (geometry: MultiPolygon): PolygonShape[] =>
  geometry.map((polygon) => ({
    outer: fromRing(polygon[0]!),
    holes: polygon.slice(1).map(fromRing),
  }))

export const polygonsToPathModel = (polygons: PolygonShape[]): PathModel => {
  const subpaths: PathSubpath[] = []
  for (const polygon of polygons) {
    subpaths.push({
      nodes: polygon.outer.map((point) => makeNode(point.x, point.y)),
      closed: true,
    })
    for (const hole of polygon.holes) {
      subpaths.push({
        nodes: hole.map((point) => makeNode(point.x, point.y)),
        closed: true,
      })
    }
  }
  return { subpaths }
}

export const applyBoolean = (
  operation: BooleanOperation,
  left: PolygonShape[],
  right: PolygonShape[],
): PolygonShape[] => {
  const leftGeometry = toGeometry(left)
  const rightGeometry = toGeometry(right)
  switch (operation) {
    case 'union':
      return fromGeometry(clipUnion(leftGeometry, rightGeometry))
    case 'subtract':
      return fromGeometry(clipDifference(leftGeometry, rightGeometry))
    case 'intersect':
      return fromGeometry(clipIntersection(leftGeometry, rightGeometry))
    case 'exclude':
      return fromGeometry(clipXor(leftGeometry, rightGeometry))
    default:
      return []
  }
}

export interface BooleanOutcome {
  polygons: PolygonShape[]
  model: PathModel
  supported: boolean
  reason: string
}

const CLOSED_REQUIRED = 'Wymagane są zamknięte kształty'

export const booleanOnModels = (
  operation: BooleanOperation,
  left: PathModel,
  right: PathModel,
  samplesPerSegment = 24,
): BooleanOutcome => {
  const empty: BooleanOutcome = {
    polygons: [],
    model: { subpaths: [] },
    supported: false,
    reason: CLOSED_REQUIRED,
  }
  if (!hasClosedSubpath(left) || !hasClosedSubpath(right)) {
    return empty
  }

  const leftPolygons = flattenToPolygons(left, samplesPerSegment)
  const rightPolygons = flattenToPolygons(right, samplesPerSegment)
  if (leftPolygons.length === 0 || rightPolygons.length === 0) {
    return empty
  }

  const polygons = applyBoolean(operation, leftPolygons, rightPolygons)
  return {
    polygons,
    model: polygonsToPathModel(polygons),
    supported: true,
    reason: '',
  }
}

export const booleanArea = (polygons: PolygonShape[]): number => {
  let area = 0
  for (const polygon of polygons) {
    let outer = 0
    for (let index = 0; index < polygon.outer.length; index += 1) {
      const start = polygon.outer[index]!
      const end = polygon.outer[(index + 1) % polygon.outer.length]!
      outer += start.x * end.y - end.x * start.y
    }
    area += Math.abs(outer) / 2
    for (const hole of polygon.holes) {
      let inner = 0
      for (let index = 0; index < hole.length; index += 1) {
        const start = hole[index]!
        const end = hole[(index + 1) % hole.length]!
        inner += start.x * end.y - end.x * start.y
      }
      area -= Math.abs(inner) / 2
    }
  }
  return area
}
