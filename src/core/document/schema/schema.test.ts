import { describe, expect, it } from 'vitest'
import { createDocument, createLayer, createRectangle } from '../factory'
import { parseDocument, parseDocumentJson, serializeDocument } from './index'

const minimalDocument = {
  schemaVersion: 1,
  id: 'doc_1',
  name: 'Minimal',
  width: 100,
  height: 50,
  layers: [
    {
      id: 'layer_1',
      children: [{ id: 'rect_1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }],
    },
  ],
}

describe('parseDocument', () => {
  it('fills defaults for optional fields', () => {
    const result = parseDocument(minimalDocument)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value.unit).toBe('px')
    expect(result.value.background).toBeNull()
    expect(result.value.exportSettings.dpi).toBe(96)
    expect(result.value.layers[0]?.visible).toBe(true)
    expect(result.value.layers[0]?.children[0]?.opacity).toBe(1)
    expect(result.value.layers[0]?.children[0]?.transform).toEqual({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    })
  })

  it('reports duplicate identifiers', () => {
    const duplicated = {
      ...minimalDocument,
      layers: [
        {
          id: 'layer_1',
          children: [
            { id: 'same', type: 'rectangle', x: 0, y: 0, width: 1, height: 1 },
            { id: 'same', type: 'ellipse', cx: 0, cy: 0, rx: 1, ry: 1 },
          ],
        },
      ],
    }
    const result = parseDocument(duplicated)
    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.error.some((issue) => issue.reason === 'duplicate_id')).toBe(true)
  })

  it('reports invalid colors with their path', () => {
    const invalid = {
      ...minimalDocument,
      layers: [
        {
          id: 'layer_1',
          children: [
            {
              id: 'rect_1',
              type: 'rectangle',
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              style: { fill: { color: 'nope' } },
            },
          ],
        },
      ],
    }
    const result = parseDocument(invalid)
    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.error[0]?.reason).toBe('invalid_color')
    expect(result.error[0]?.path).toBe('layers[0].children[0].style.fill.color')
  })

  it('rejects unknown schema versions', () => {
    const result = parseDocument({ ...minimalDocument, schemaVersion: 99 })
    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.error[0]?.reason).toBe('unsupported_schema_version')
  })

  it('reports malformed JSON text', () => {
    const result = parseDocumentJson('{ nope')
    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.error[0]?.reason).toBe('invalid_json')
  })

  it('round-trips documents created through the factory', () => {
    const document = createDocument({
      id: 'doc_round',
      name: 'Round trip',
      width: 20,
      height: 20,
      background: '#ffffff',
      layers: [createLayer([createRectangle({ x: 1, y: 2, width: 3, height: 4 })], { id: 'l' })],
    })
    const result = parseDocumentJson(serializeDocument(document))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(document)
    }
  })
})
