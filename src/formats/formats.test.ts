import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createDocument, createLayer, createRectangle } from '@/core/document'
import { createDefaultFormatRegistry } from './index'
import { convertLegacyScene, legacySceneReader } from './legacy-scene'
import { encodeText, type ReadInput } from './types'
import { vexEntries, vexReader, vexWriter } from './vex'

const sampleDocument = () =>
  createDocument({
    id: 'doc_fixture',
    name: 'Fixture',
    width: 64,
    height: 32,
    background: '#ffffff',
    metadata: { createdAt: '2026-01-01T00:00:00.000Z', generator: 'vector-engine' },
    layers: [
      createLayer([createRectangle({ x: 1, y: 1, width: 10, height: 10 }, { id: 'rect_a' })], {
        id: 'layer_a',
      }),
    ],
  })

const blobToInput = async (fileName: string, blob: Blob): Promise<ReadInput> => ({
  fileName,
  bytes: new Uint8Array(await blob.arrayBuffer()),
})

describe('vex container', () => {
  it('writes manifest and document entries and reads them back', async () => {
    const document = sampleDocument()
    const blob = await vexWriter.write(document)
    expect(blob.type).toBe(vexWriter.mimeType)

    const input = await blobToInput('fixture.vex', blob)
    const entries = unzipSync(input.bytes)
    expect(Object.keys(entries).sort()).toEqual([vexEntries.document, vexEntries.manifest].sort())

    expect(vexReader.matches(input)).toBe(true)
    const result = await vexReader.read(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.document).toEqual(document)
      expect(result.value.warnings).toEqual([])
    }
  })

  it('embeds thumbnails and reports unknown entries', async () => {
    const blob = await vexWriter.write(sampleDocument(), { thumbnail: new Uint8Array([1, 2, 3]) })
    const input = await blobToInput('fixture.vex', blob)
    const entries = unzipSync(input.bytes)
    expect(entries[vexEntries.thumbnail]).toEqual(new Uint8Array([1, 2, 3]))

    const result = await vexReader.read(input)
    expect(result.ok && result.value.warnings).toEqual([])
  })

  it('rejects non-zip payloads', async () => {
    const input: ReadInput = { fileName: 'broken.vex', bytes: encodeText('plain text') }
    expect(vexReader.matches(input)).toBe(false)
    const result = await vexReader.read(input)
    expect(result.ok).toBe(false)
  })
})

describe('legacy scene reader', () => {
  const legacyScene = {
    width: 200,
    height: 100,
    background: '#eeeeee',
    shapes: [
      { type: 'rect', x: 10, y: 10, width: 50, height: 20, fill: '#ff0000' },
      { type: 'circle', cx: 100, cy: 50, r: 20, stroke: '#0000ff', strokeWidth: 3 },
      { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, color: '#00ff00', thickness: 2 },
    ],
  }

  it('converts legacy shapes into document nodes', () => {
    const document = convertLegacyScene(
      {
        ...legacyScene,
        shapes: legacyScene.shapes.map((shape) => ({ ...shape, opacity: 1 })),
      } as Parameters<typeof convertLegacyScene>[0],
      'legacy',
    )
    expect(document.width).toBe(200)
    expect(document.layers[0]?.children.map((node) => node.type)).toEqual([
      'rectangle',
      'ellipse',
      'path',
    ])
  })

  it('flags imported files as legacy and never drops shapes silently', async () => {
    const input: ReadInput = {
      fileName: 'scene.json',
      bytes: encodeText(JSON.stringify(legacyScene)),
    }
    expect(legacySceneReader.matches(input)).toBe(true)
    const result = await legacySceneReader.read(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.warnings.map((warning) => warning.code)).toEqual(['legacy_format'])
      expect(result.value.document.layers[0]?.children).toHaveLength(3)
    }
  })
})

describe('format registry', () => {
  const registry = createDefaultFormatRegistry()

  it('sniffs readers by extension and content', async () => {
    const native = { fileName: 'a.json', bytes: encodeText(JSON.stringify(sampleDocument())) }
    expect(registry.findReader(native)?.id).toBe('document-json')

    const legacy = {
      fileName: 'b.json',
      bytes: encodeText(JSON.stringify({ width: 1, height: 1, shapes: [] })),
    }
    expect(registry.findReader(legacy)?.id).toBe('legacy-scene')

    const vex = await blobToInput('c.vex', await vexWriter.write(sampleDocument()))
    expect(registry.findReader(vex)?.id).toBe('vex')
    expect(registry.findReader({ fileName: 'd.svg', bytes: new Uint8Array() })).toBeUndefined()
  })

  it('exposes writers and accepted file types', () => {
    expect(registry.writers.map((writer) => writer.id)).toEqual(['vex', 'document-json'])
    expect(registry.acceptedFileTypes()).toContain('.vex')
    expect(registry.acceptedFileTypes()).toContain('application/json')
  })
})
