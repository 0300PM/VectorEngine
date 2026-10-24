import type { Point } from '@/types/scene'
import { boundsFromRect, rectFromBounds, type Bounds, type Rect } from './geometry'

export interface ViewState {
  scale: number
  offsetX: number
  offsetY: number
}

export interface Size {
  width: number
  height: number
}

export const MIN_SCALE = 0.05
export const MAX_SCALE = 32
export const ZOOM_STEP = 1.2
export const DEFAULT_FIT_PADDING = 64

export const clampScale = (scale: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(scale) ? scale : 1))

export const createView = (): ViewState => ({ scale: 1, offsetX: 0, offsetY: 0 })

export const screenToDocument = (view: ViewState, screen: Point): Point => ({
  x: (screen.x - view.offsetX) / view.scale,
  y: (screen.y - view.offsetY) / view.scale,
})

export const documentToScreen = (view: ViewState, document: Point): Point => ({
  x: view.offsetX + document.x * view.scale,
  y: view.offsetY + document.y * view.scale,
})

export const zoomAt = (view: ViewState, screen: Point, factor: number): ViewState => {
  const nextScale = clampScale(view.scale * factor)
  const document = screenToDocument(view, screen)
  return {
    scale: nextScale,
    offsetX: screen.x - document.x * nextScale,
    offsetY: screen.y - document.y * nextScale,
  }
}

export const zoomIn = (view: ViewState, screen: Point): ViewState => zoomAt(view, screen, ZOOM_STEP)

export const zoomOut = (view: ViewState, screen: Point): ViewState =>
  zoomAt(view, screen, 1 / ZOOM_STEP)

export const panBy = (view: ViewState, deltaX: number, deltaY: number): ViewState => ({
  scale: view.scale,
  offsetX: view.offsetX + deltaX,
  offsetY: view.offsetY + deltaY,
})

export const fitView = (
  content: Bounds,
  viewport: Size,
  padding = DEFAULT_FIT_PADDING,
): ViewState => {
  const width = Math.max(1, content.maxX - content.minX)
  const height = Math.max(1, content.maxY - content.minY)
  const innerWidth = Math.max(1, viewport.width - padding * 2)
  const innerHeight = Math.max(1, viewport.height - padding * 2)
  const scale = clampScale(Math.min(innerWidth / width, innerHeight / height))
  return {
    scale,
    offsetX: (viewport.width - width * scale) / 2 - content.minX * scale,
    offsetY: (viewport.height - height * scale) / 2 - content.minY * scale,
  }
}

export const fitRect = (content: Rect, viewport: Size, padding = DEFAULT_FIT_PADDING): ViewState =>
  fitView(boundsFromRect(content), viewport, padding)

export const actualSize = (viewport: Size, documentSize: Size): ViewState => ({
  scale: 1,
  offsetX: (viewport.width - documentSize.width) / 2,
  offsetY: (viewport.height - documentSize.height) / 2,
})

export const visibleDocumentRect = (view: ViewState, viewport: Size): Rect => ({
  x: -view.offsetX / view.scale,
  y: -view.offsetY / view.scale,
  width: viewport.width / view.scale,
  height: viewport.height / view.scale,
})

export const documentSizeOf = (bounds: Bounds): Size => ({
  width: Math.max(0, bounds.maxX - bounds.minX),
  height: Math.max(0, bounds.maxY - bounds.minY),
})

export const boundsCenter = (bounds: Bounds): Point => ({
  x: (bounds.minX + bounds.maxX) / 2,
  y: (bounds.minY + bounds.maxY) / 2,
})

export const zoomLabel = (view: ViewState): string => `${Math.round(view.scale * 100)}%`

export { rectFromBounds }
