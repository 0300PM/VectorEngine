import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createGroup,
  createLayer,
  createPath,
  createRectangle,
  createText,
} from '@/core/document'
import { lineTo, moveTo, translation } from '@/core/geometry'
import { buildRenderScene } from './build'
import { scaleRenderScene } from './scale'

const font = { family: 'sans-serif', size: 12, weight: 400, style: 'normal' as const }
const red = { fill: { color: '#ff0000' } }

describe('buildRenderScene', () => {
  it('composes layer, group and node transforms', () => {
    const document = createDocument({
      width: 100,
      height: 100,
      layers: [
        createLayer(
          [
            createGroup(
              [
                createRectangle(
                  { x: 0, y: 0, width: 10, height: 10 },
                  { id: 'leaf', transform: translation(1, 1), opacity: 0.5, style: red },
                ),
              ],
              { transform: translation(10, 0) },
            ),
          ],
          { opacity: 0.5 },
        ),
      ],
    })
    const { scene, unsupported } = buildRenderScene(document)
    expect(unsupported).toEqual([])
    expect(scene.items).toHaveLength(1)
    expect(scene.items[0]?.transform).toMatchObject({ e: 11, f: 1 })
    expect(scene.items[0]?.opacity).toBeCloseTo(0.25)
  })

  it('skips hidden layers and unpainted nodes', () => {
    const hidden = createDocument({
      width: 10,
      height: 10,
      layers: [
        createLayer([createRectangle({ x: 0, y: 0, width: 1, height: 1 }, { style: red })], {
          visible: false,
        }),
      ],
    })
    expect(buildRenderScene(hidden).scene.items).toHaveLength(0)

    const unpainted = createDocument({
      width: 10,
      height: 10,
      layers: [createLayer([createRectangle({ x: 0, y: 0, width: 1, height: 1 })])],
    })
    expect(buildRenderScene(unpainted).scene.items).toHaveLength(0)
  })

  it('reports unsupported features instead of dropping them silently', () => {
    const document = createDocument({
      width: 10,
      height: 10,
      layers: [
        createLayer([
          createText({ x: 0, y: 0, content: 'Hi', font }, { id: 'text_1' }),
          createPath([moveTo(0, 0), lineTo(5, 5)], {
            id: 'path_1',
            fillRule: 'evenodd',
            style: red,
          }),
        ]),
      ],
    })
    const { scene, unsupported } = buildRenderScene(document)
    expect(unsupported).toEqual([
      { nodeId: 'text_1', feature: 'text' },
      { nodeId: 'path_1', feature: 'evenodd' },
    ])
    expect(scene.items.map((item) => item.nodeId)).toEqual(['path_1'])
  })

  it('converts physical units to pixels', () => {
    const document = createDocument({ width: 25.4, height: 12.7, unit: 'mm' })
    const { scene } = buildRenderScene(document)
    expect(scene.width).toBe(96)
    expect(scene.height).toBe(48)
  })

  it('scales scenes to a target pixel size', () => {
    const document = createDocument({
      width: 100,
      height: 50,
      layers: [
        createLayer([createRectangle({ x: 10, y: 10, width: 10, height: 10 }, { style: red })]),
      ],
    })
    const scaled = scaleRenderScene(buildRenderScene(document).scene, { width: 200, height: 100 })
    expect(scaled.width).toBe(200)
    expect(scaled.items[0]?.transform).toMatchObject({ a: 2, d: 2 })
  })
})
