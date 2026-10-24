import type { Point, SceneObject } from '@/types/scene'
import { objectBounds } from './hitTest'

export interface SnapSettings {
  enabled: boolean
  grid: boolean
  guides: boolean
  edges: boolean
  centers: boolean
  points: boolean
  tolerance: number
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: true,
  grid: true,
  guides: true,
  edges: true,
  centers: true,
  points: true,
  tolerance: 6,
}

export interface SnapCandidates {
  gridX?: number[]
  gridY?: number[]
  guideX?: number[]
  guideY?: number[]
  edgeX?: number[]
  edgeY?: number[]
  centerX?: number[]
  centerY?: number[]
  points?: Point[]
}

export interface SnapResult {
  point: Point
  matched: boolean
}

const nearest = (
  value: number,
  candidates: readonly number[],
  tolerance: number,
): number | null => {
  let best: number | null = null
  let bestDelta = tolerance
  for (const candidate of candidates) {
    const delta = Math.abs(candidate - value)
    if (delta < bestDelta) {
      bestDelta = delta
      best = candidate
    }
  }
  return best
}

export const snapDocumentPoint = (
  point: Point,
  settings: SnapSettings,
  scale: number,
  candidates: SnapCandidates,
): SnapResult => {
  if (!settings.enabled) {
    return { point: { ...point }, matched: false }
  }
  const tolerance = settings.tolerance / Math.max(scale, 1e-6)

  const xSources: number[] = []
  const ySources: number[] = []
  if (settings.grid) {
    xSources.push(...(candidates.gridX ?? []))
    ySources.push(...(candidates.gridY ?? []))
  }
  if (settings.guides) {
    xSources.push(...(candidates.guideX ?? []))
    ySources.push(...(candidates.guideY ?? []))
  }
  if (settings.edges) {
    xSources.push(...(candidates.edgeX ?? []))
    ySources.push(...(candidates.edgeY ?? []))
  }
  if (settings.centers) {
    xSources.push(...(candidates.centerX ?? []))
    ySources.push(...(candidates.centerY ?? []))
  }

  let x = nearest(point.x, xSources, tolerance)
  let y = nearest(point.y, ySources, tolerance)
  let matched = x !== null || y !== null

  if (settings.points && candidates.points && candidates.points.length > 0) {
    let bestPoint: Point | null = null
    let bestDistance = tolerance
    for (const candidate of candidates.points) {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
      if (distance < bestDistance) {
        bestDistance = distance
        bestPoint = candidate
      }
    }
    if (bestPoint) {
      x = bestPoint.x
      y = bestPoint.y
      matched = true
    }
  }

  return { point: { x: x ?? point.x, y: y ?? point.y }, matched }
}

export const snapToGrid = (point: Point, spacing: number): Point => {
  if (spacing <= 0) {
    return { ...point }
  }
  return {
    x: Math.round(point.x / spacing) * spacing,
    y: Math.round(point.y / spacing) * spacing,
  }
}

export const gridLines = (min: number, max: number, spacing: number): number[] => {
  if (spacing <= 0 || max < min) {
    return []
  }
  const startIndex = Math.floor(min / spacing)
  const endIndex = Math.floor(max / spacing)
  const lines: number[] = []
  for (let index = startIndex; index <= endIndex; index += 1) {
    lines.push(Number((index * spacing).toFixed(6)))
  }
  return lines
}

export interface BoundsSnapCandidates {
  edgeX: number[]
  edgeY: number[]
  centerX: number[]
  centerY: number[]
}

export const candidatesForBounds = (objects: readonly SceneObject[]): BoundsSnapCandidates => {
  const edgeX: number[] = []
  const edgeY: number[] = []
  const centerX: number[] = []
  const centerY: number[] = []
  for (const object of objects) {
    const box = objectBounds(object)
    if (!box) {
      continue
    }
    edgeX.push(box.minX, box.maxX)
    edgeY.push(box.minY, box.maxY)
    centerX.push((box.minX + box.maxX) / 2)
    centerY.push((box.minY + box.maxY) / 2)
  }
  return { edgeX, edgeY, centerX, centerY }
}
