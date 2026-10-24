import { describe, expect, it } from 'vitest'
import {
  actualSize,
  boundsCenter,
  clampScale,
  createView,
  documentToScreen,
  fitView,
  fitRect,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  screenToDocument,
  visibleDocumentRect,
  zoomAt,
  zoomIn,
  zoomOut,
  zoomLabel,
} from '../view'

const viewport = { width: 800, height: 600 }

describe('view transform', () => {
  it('round-trips screen and document coordinates', () => {
    const view = { scale: 2, offsetX: -40, offsetY: 30 }
    const document = { x: 120, y: -80 }
    const screen = documentToScreen(view, document)
    expect(screen).toEqual({ x: 200, y: -130 })
    expect(screenToDocument(view, screen)).toEqual(document)
  })

  it('zooms around the point under the cursor', () => {
    const view = createView()
    const cursor = { x: 320, y: 240 }
    const zoomed = zoomAt(view, cursor, 2)

    expect(zoomed.scale).toBe(2)
    expect(screenToDocument(zoomed, cursor)).toEqual({ x: 320, y: 240 })
  })

  it('keeps the anchored document point stable across repeated zooms', () => {
    let view = createView()
    const cursor = { x: 100, y: 100 }
    for (const factor of [2, 0.5, 3, 0.25]) {
      view = zoomAt(view, cursor, factor)
      expect(screenToDocument(view, cursor)).toEqual({ x: 100, y: 100 })
    }
  })

  it('clamps the scale range', () => {
    expect(clampScale(1000)).toBe(MAX_SCALE)
    expect(clampScale(0)).toBe(MIN_SCALE)
    expect(clampScale(Number.NaN)).toBe(1)
    expect(zoomAt(createView(), { x: 0, y: 0 }, 1e9).scale).toBe(MAX_SCALE)
  })

  it('pans without changing the scale', () => {
    const view = createView()
    const panned = panBy(view, -120, 40)
    expect(panned.scale).toBe(1)
    expect(panned.offsetX).toBe(-120)
    expect(panned.offsetY).toBe(40)
  })

  it('zooms in and out by a fixed step', () => {
    const view = createView()
    const cursor = { x: 0, y: 0 }
    expect(zoomIn(view, cursor).scale).toBeCloseTo(1.2, 6)
    expect(zoomOut(view, cursor).scale).toBeCloseTo(1 / 1.2, 6)
  })

  it('fits content to the viewport', () => {
    const view = fitView({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, viewport, 0)
    expect(view.scale).toBe(6)
    const center = documentToScreen(view, boundsCenter({ minX: 0, minY: 0, maxX: 100, maxY: 100 }))
    expect(center).toEqual({ x: 400, y: 300 })
  })

  it('respects padding when fitting', () => {
    const view = fitView({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, viewport, 100)
    expect(view.scale).toBe(4)
  })

  it('fits an arbitrary rectangle', () => {
    const view = fitRect({ x: 50, y: 50, width: 200, height: 100 }, viewport, 0)
    expect(view.scale).toBe(4)
    const corner = documentToScreen(view, { x: 50, y: 50 })
    expect(corner.x).toBeCloseTo(0, 6)
    expect(corner.y).toBeCloseTo(100, 6)
  })

  it('restores actual size at 100%', () => {
    const view = actualSize(viewport, { width: 400, height: 300 })
    expect(view.scale).toBe(1)
    expect(documentToScreen(view, { x: 0, y: 0 })).toEqual({ x: 200, y: 150 })
    expect(documentToScreen(view, { x: 400, y: 300 })).toEqual({ x: 600, y: 450 })
  })

  it('reports the visible document rectangle', () => {
    const view = { scale: 2, offsetX: -100, offsetY: -50 }
    const rect = visibleDocumentRect(view, viewport)
    expect(rect).toEqual({ x: 50, y: 25, width: 400, height: 300 })
  })

  it('formats the zoom label', () => {
    expect(zoomLabel({ scale: 1, offsetX: 0, offsetY: 0 })).toBe('100%')
    expect(zoomLabel({ scale: 0.25, offsetX: 0, offsetY: 0 })).toBe('25%')
  })
})
