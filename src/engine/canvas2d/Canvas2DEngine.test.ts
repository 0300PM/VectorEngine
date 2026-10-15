import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { createDocument, createLayer, createRectangle } from '@/core/document'
import { buildRenderScene } from '@/core/scene'
import { Canvas2DEngine } from './Canvas2DEngine'
import type { Canvas2DSurface } from './surface'

const createNodeSurface = (width: number, height: number): Canvas2DSurface =>
  createCanvas(width, height) as unknown as Canvas2DSurface

const pixelAt = (pixels: Uint8ClampedArray, width: number, x: number, y: number) => {
  const index = (y * width + x) * 4
  return Array.from(pixels.slice(index, index + 4))
}

describe('Canvas2DEngine', () => {
  it('renders fills over the document background', async () => {
    const document = createDocument({
      width: 20,
      height: 20,
      background: '#ffffff',
      layers: [
        createLayer([
          createRectangle(
            { x: 5, y: 5, width: 10, height: 10 },
            { style: { fill: { color: '#ff0000' } } },
          ),
        ]),
      ],
    })
    const engine = new Canvas2DEngine(createNodeSurface)
    const result = await engine.render(buildRenderScene(document).scene)

    expect(result.engine).toBe('canvas2d')
    expect(result.width).toBe(20)
    expect(pixelAt(result.pixels, 20, 10, 10)).toEqual([255, 0, 0, 255])
    expect(pixelAt(result.pixels, 20, 1, 1)).toEqual([255, 255, 255, 255])
  })

  it('keeps transparency when the document has no background', async () => {
    const document = createDocument({ width: 4, height: 4 })
    const engine = new Canvas2DEngine(createNodeSurface)
    const result = await engine.render(buildRenderScene(document).scene)
    expect(pixelAt(result.pixels, 4, 2, 2)).toEqual([0, 0, 0, 0])
  })
})
