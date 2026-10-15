export type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type Canvas2DSurface = {
  width: number
  height: number
  getContext(contextId: '2d'): Canvas2DContext | null
}

export type SurfaceFactory = (width: number, height: number) => Canvas2DSurface

export const createBrowserSurface: SurfaceFactory = (width, height) => {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}
