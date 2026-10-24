import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultScene } from '@/data/defaultScene'
import { WasmBackend } from '@/engine/wasmBackend'
import { executeBatchExport } from './batchExporter'
import { computeCrc32, parseZipArchive } from './zipWriter'

describe('batch exporter, collision deduplication, ZIP integrity, and AbortSignal cancellation', () => {
  let backend: WasmBackend

  beforeAll(async () => {
    const wasmDir = path.resolve(process.cwd(), 'public/wasm')
    const wasmBytes = await readFile(path.join(wasmDir, 'vector_engine.wasm'))
    const baseHref = `${pathToFileURL(path.resolve(process.cwd(), 'public')).href}/`
    const wasmBuffer = wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength)
    backend = await WasmBackend.create(baseHref, wasmBuffer)
  })

  it('exports multiple targets with per-item overrides, resolves duplicate filenames, and builds a valid CRC-verified ZIP', async () => {
    const progressSnapshots: number[] = []

    const report = await executeBatchExport({
      backend,
      source: defaultScene,
      documentName: 'Orbit Study',
      sharedOptions: {
        format: 'png',
        target: { type: 'scene' },
        scale: 0.5,
        trimToBounds: true,
        background: 'transparent',
      },
      items: [
        { id: 'item-1', label: 'Node Icon', target: { type: 'object', objectId: 'node-a' } },
        { id: 'item-2', label: 'Node Icon', target: { type: 'object', objectId: 'node-b' } },
        {
          id: 'item-3',
          label: 'Typography Layer',
          target: { type: 'layer', layerId: 'typography' },
          options: { format: 'svg', minifySvg: true, scale: 1 },
        },
        { id: 'item-4', label: 'Missing Node', target: { type: 'object', objectId: 'non-existent-id' } },
      ],
      filenameTemplate: '{document}_{object}_{scale}',
      packageAsZip: true,
      onProgress: (ev) => {
        progressSnapshots.push(ev.completed)
      },
    })

    expect(report.succeeded).toBe(3)
    expect(report.failed).toBe(1)
    expect(report.cancelled).toBe(false)
    expect(report.collisions).toHaveLength(1)
    expect(report.collisions[0]?.resolvedFilename).toBe('orbit-study_node-icon_0.5x-2.png')
    expect(progressSnapshots.at(-1)).toBe(4)

    expect(report.zipData).toBeDefined()
    expect(report.zipFilename).toBe('orbit-study-batch.zip')

    const parsedZip = await parseZipArchive(report.zipData!)
    expect(parsedZip).toHaveLength(3)
    expect(parsedZip.map((e) => e.filename)).toEqual([
      'orbit-study_node-icon_0.5x.png',
      'orbit-study_node-icon_0.5x-2.png',
      'orbit-study_typography-layer_1x.svg',
    ])

    for (const entry of parsedZip) {
      expect(computeCrc32(entry.data)).toBe(entry.crc32)
      const matchingItem = report.items.find((it) => it.filename === entry.filename)
      expect(matchingItem?.result).toBeDefined()
      expect(Buffer.compare(Buffer.from(entry.data), Buffer.from(matchingItem!.result!.data))).toBe(0)
    }
  })

  it('cancels queued batch items cleanly via AbortController', async () => {
    const controller = new AbortController()

    const report = await executeBatchExport({
      backend,
      source: defaultScene,
      documentName: 'Orbit Study',
      sharedOptions: {
        format: 'png',
        target: { type: 'scene' },
        scale: 0.5,
        background: 'document',
      },
      items: [
        { id: 'a', label: 'Core', target: { type: 'object', objectId: 'core' } },
        { id: 'b', label: 'Frame', target: { type: 'object', objectId: 'frame' } },
        { id: 'c', label: 'Title', target: { type: 'object', objectId: 'title' } },
      ],
      packageAsZip: true,
      signal: controller.signal,
      onProgress: (event) => {
        if (event.completed >= 1) {
          controller.abort()
        }
      },
    })

    expect(report.cancelled).toBe(true)
    expect(report.succeeded).toBe(1)
    expect(report.cancelledCount).toBe(2)
    expect(report.zipData).toBeUndefined()
    expect(report.items.map((i) => i.status)).toEqual(['completed', 'cancelled', 'cancelled'])
  })
})
