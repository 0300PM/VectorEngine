import type { PathModel, PathSubpath, Point } from './model'
import { segmentKind, segmentPointAt } from './ops'

export interface PolygonShape {
  outer: Point[]
  holes: Point[][]
}

const MIN_AREA = 1e-9

const dedupe = (points: Point[]): Point[] => {
  const result: Point[] = []
  for (const point of points) {
    const previous = result.at(-1)
    if (!previous || Math.abs(previous.x - point.x) > 1e-9 || Math.abs(previous.y - point.y) > 1e-9) {
      result.push(point)
    }
  }
  if (result.length > 1) {
    const first = result[0]!
    const last = result.at(-1)!
    if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) {
      result.pop()
    }
  }
  return result
}

export const sampleSubpath = (subpath: PathSubpath, samplesPerSegment = 24): Point[] => {
  const nodes = subpath.nodes
  if (nodes.length === 0) {
    return []
  }
  if (nodes.length === 1) {
    return [{ ...nodes[0]! }]
  }

  const segmentCount = subpath.closed ? nodes.length : nodes.length - 1
  const points: Point[] = [{ ...nodes[0]! }]
  for (let index = 0; index < segmentCount; index += 1) {
    const from = nodes[index]!
    const to = nodes[(index + 1) % nodes.length]!
    const steps = segmentKind(from, to) === 'line' ? 1 : samplesPerSegment
    for (let step = 1; step <= steps; step += 1) {
      points.push(segmentPointAt(from, to, step / steps))
    }
  }
  return dedupe(points)
}

export const ringArea = (points: Point[]): number => {
  if (points.length < 3) {
    return 0
  }
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!
    const end = points[(index + 1) % points.length]!
    area += start.x * end.y - end.x * start.y
  }
  return area / 2
}

export const hasClosedSubpath = (model: PathModel): boolean => model.subpaths.some((subpath) => subpath.closed)

export const flattenToPolygons = (
  model: PathModel,
  samplesPerSegment = 24,
): PolygonShape[] => {
  const polygons: PolygonShape[] = []
  for (const subpath of model.subpaths) {
    if (!subpath.closed) {
      continue
    }
    const points = sampleSubpath(subpath, samplesPerSegment)
    if (points.length < 3) {
      continue
    }
    if (Math.abs(ringArea(points)) < MIN_AREA) {
      continue
    }
    polygons.push({ outer: points, holes: [] })
  }
  return polygons
}
