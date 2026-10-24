import type { Point } from '@/types/scene'
import type { Rect } from './geometry'

export interface Guide {
  id: string
  orientation: 'h' | 'v'
  position: number
}

export type GuideOrientation = Guide['orientation']

export const createGuide = (orientation: GuideOrientation, position: number, id: string): Guide => ({
  id,
  orientation,
  position,
})

export const guidesFromRect = (rect: Rect, prefix: string): Guide[] => [
  { id: `${prefix}-v-min`, orientation: 'v', position: rect.x },
  { id: `${prefix}-v-center`, orientation: 'v', position: rect.x + rect.width / 2 },
  { id: `${prefix}-v-max`, orientation: 'v', position: rect.x + rect.width },
  { id: `${prefix}-h-min`, orientation: 'h', position: rect.y },
  { id: `${prefix}-h-center`, orientation: 'h', position: rect.y + rect.height / 2 },
  { id: `${prefix}-h-max`, orientation: 'h', position: rect.y + rect.height },
]

export interface GuideHit {
  guide: Guide
  orientation: GuideOrientation
}

export const hitGuide = (
  guides: readonly Guide[],
  point: Point,
  tolerance: number,
): GuideHit | null => {
  let best: GuideHit | null = null
  let bestDistance = tolerance
  for (const guide of guides) {
    const distance =
      guide.orientation === 'v'
        ? Math.abs(point.x - guide.position)
        : Math.abs(point.y - guide.position)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { guide, orientation: guide.orientation }
    }
  }
  return best
}

export const removeGuidesInRect = (
  guides: readonly Guide[],
  rect: Rect,
  tolerance: number,
): Guide[] =>
  guides.filter((guide) => {
    if (guide.orientation === 'v') {
      return guide.position < rect.x - tolerance || guide.position > rect.x + rect.width + tolerance
    }
    return guide.position < rect.y - tolerance || guide.position > rect.y + rect.height + tolerance
  })

export const moveGuide = (guide: Guide, position: number): Guide => ({ ...guide, position })

export const nextGuideId = (guides: readonly Guide[], orientation: GuideOrientation): string => {
  const used = new Set(guides.map((guide) => guide.id))
  const base = `guide-${orientation}`
  let index = 1
  let id = `${base}-${index}`
  while (used.has(id)) {
    index += 1
    id = `${base}-${index}`
  }
  return id
}

export const guidesToCandidates = (guides: readonly Guide[]): { guideX: number[]; guideY: number[] } => {
  const guideX: number[] = []
  const guideY: number[] = []
  for (const guide of guides) {
    if (guide.orientation === 'v') {
      guideX.push(guide.position)
    } else {
      guideY.push(guide.position)
    }
  }
  return { guideX, guideY }
}
