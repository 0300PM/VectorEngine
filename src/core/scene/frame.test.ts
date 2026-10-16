import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createLayer,
  createRectangle,
  createPath,
  filterDocumentNodes,
  cropDocument,
  recolorDocument,
} from '@/core/document'
import {
  cubicTo,
  moveTo,
  pathBounds,
  rotation,
  translation,
  multiply,
  lineTo,
} from '@/core/geometry'
import { buildRenderScene } from './build'
import { cropRenderScene, fitRenderScene, sceneBounds } from './frame'

const document = createDocument({
  id: 'd',
  name: 'Frame',
  width: 100,
  height: 50,
  layers: [
    createLayer([
      createRectangle(
        { x: 10, y: 10, width: 20, height: 10 },
        { id: 'a', style: { fill: { color: '#000' } } },
      ),
      createRectangle(
        { x: 50, y: 20, width: 10, height: 10 },
        { id: 'b', style: { stroke: { color: '#000', width: 4 } } },
      ),
      createPath([moveTo(0, 0), lineTo(100, 0)], { id: 'invisible' }),
    ]),
  ],
})

describe('path bounds', () => {
  it('uses curve extrema instead of control points', () => {
    const bounds = pathBounds([moveTo(0, 0), cubicTo(0, 20, 10, 20, 10, 0)])
    expect(bounds?.maxY).toBeCloseTo(15)
    expect(bounds?.minY).toBe(0)
    expect(bounds?.maxX).toBe(10)
  })

  it('applies transforms before measuring', () => {
    const matrix = multiply(translation(5, 5), rotation(Math.PI / 2))
    const bounds = pathBounds([moveTo(0, 0), lineTo(10, 0)], matrix)
    expect(bounds?.minX).toBeCloseTo(5)
    expect(bounds?.maxY).toBeCloseTo(15)
    expect(pathBounds([])).toBeUndefined()
  })
})

describe('scene framing', () => {
  const scene = buildRenderScene(document).scene

  it('measures scene bounds including stroke width', () => {
    const bounds = sceneBounds(scene)
    expect(bounds).toEqual({ minX: 10, minY: 10, maxX: 62, maxY: 32 })
  })

  it('fits scenes into a target size with centring and padding', () => {
    const fitted = fitRenderScene(scene, { width: 200, height: 200 }, 10)
    expect(fitted.width).toBe(200)
    const item = fitted.items[0]!
    expect(item.transform.a).toBeCloseTo(1.8)
    expect(item.transform.e).toBeCloseTo(10)
    expect(item.transform.f).toBeCloseTo(55)
  })

  it('crops scenes to the selected objects', () => {
    const cropped = cropRenderScene(scene, new Set(['b']), 2)!
    expect(cropped.width).toBe(18)
    expect(cropped.height).toBe(18)
    expect(cropped.items).toHaveLength(1)
    expect(cropped.items[0]?.transform.e).toBeCloseTo(-46)
    expect(cropRenderScene(scene, new Set(['missing']))).toBeUndefined()
  })
})

describe('document derivation', () => {
  it('filters nodes while keeping ancestor groups and dropping empty layers', () => {
    const grouped = createDocument({
      width: 10,
      height: 10,
      layers: [
        createLayer(
          [
            {
              id: 'g',
              type: 'group',
              opacity: 1,
              transform: translation(1, 1),
              children: [createRectangle({ x: 0, y: 0, width: 1, height: 1 }, { id: 'inner' })],
            },
          ],
          { id: 'l1' },
        ),
        createLayer([createRectangle({ x: 0, y: 0, width: 1, height: 1 }, { id: 'other' })], {
          id: 'l2',
        }),
      ],
    })
    const filtered = filterDocumentNodes(grouped, new Set(['inner']))
    expect(filtered.layers.map((layer) => layer.id)).toEqual(['l1'])
    expect(filtered.layers[0]?.children[0]?.type).toBe('group')
  })

  it('crops documents by wrapping layers in translated groups', () => {
    const cropped = cropDocument(document, { x: 10, y: 10, width: 52, height: 22 })
    expect(cropped.width).toBe(52)
    const wrapper = cropped.layers[0]?.children[0]
    expect(wrapper?.type).toBe('group')
    expect(wrapper?.transform.e).toBe(-10)
    expect(
      cropDocument(document, { x: 0, y: 0, width: 5, height: 5 }).layers[0]?.children,
    ).toHaveLength(3)
  })

  it('recolours every fill and stroke', () => {
    const mono = recolorDocument(document, '#ff0000')
    const [a, b] = mono.layers[0]!.children
    expect(a?.type === 'rectangle' && a.style.fill?.color).toBe('#ff0000')
    expect(b?.type === 'rectangle' && b.style.stroke).toEqual({ color: '#ff0000', width: 4 })
  })
})
