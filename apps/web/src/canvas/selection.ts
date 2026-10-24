import type { Point, SceneObject } from '@/types/scene'
import { hitTestScene, isSelectable, objectBounds, sceneBounds } from './hitTest'
import { rectContains, rectsIntersect, type Bounds, type Rect } from './geometry'

export type MarqueeMode = 'inside' | 'intersect'

export const boundsToRect = (box: Bounds): Rect => ({
  x: box.minX,
  y: box.minY,
  width: box.maxX - box.minX,
  height: box.maxY - box.minY,
})

export const toggleInSelection = (ids: readonly string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]

export const selectAt = (
  objects: readonly SceneObject[],
  point: Point,
  additive: boolean,
  current: readonly string[],
  includeHidden = false,
): string[] => {
  const hit = hitTestScene(objects, point, includeHidden)
  if (!hit) {
    return additive ? [...current] : []
  }
  return additive ? toggleInSelection(current, hit.id) : [hit.id]
}

export const selectByMarquee = (
  objects: readonly SceneObject[],
  marquee: Rect,
  mode: MarqueeMode,
  includeHidden = false,
): string[] => {
  const result: string[] = []
  for (const object of objects) {
    if (!isSelectable(object, includeHidden)) {
      continue
    }
    const box = objectBounds(object)
    if (!box) {
      continue
    }
    const objectRect = boundsToRect(box)
    const hit =
      mode === 'inside' ? rectContains(marquee, objectRect) : rectsIntersect(marquee, objectRect)
    if (hit) {
      result.push(object.id)
    }
  }
  return result
}

export const selectionBounds = (objects: readonly SceneObject[]): Bounds | null =>
  sceneBounds(objects)

export const marqueeFromPoints = (start: Point, end: Point): Rect => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
})
