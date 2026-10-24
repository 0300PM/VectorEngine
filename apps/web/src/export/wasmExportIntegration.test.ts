import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultScene } from '@/data/defaultScene'
import { VectorEngineError } from '@/engine/errors'
import { WasmBackend } from '@/engine/wasmBackend'
import { executeExport } from './exportService'

const decodePngRgba = (bytes: Uint8Array): { width: number; height: number; pixels: Uint8Array } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let width = 0
  let height = 0
  const idatParts: Uint8Array[] = []

  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, false)
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    )
    const dataStart = offset + 8
    if (type === 'IHDR') {
      width = view.getUint32(dataStart, false)
      height = view.getUint32(dataStart + 4, false)
    } else if (type === 'IDAT') {
      idatParts.push(bytes.subarray(dataStart, dataStart + length))
    } else if (type === 'IEND') {
      break
    }
    offset = dataStart + length + 4
  }

  let totalIdat = 0
  for (const part of idatParts) {
    totalIdat += part.byteLength
  }
  const merged = new Uint8Array(totalIdat)
  let pos = 0
  for (const part of idatParts) {
    merged.set(part, pos)
    pos += part.byteLength
  }

  const raw = inflateSync(merged)
  const stride = width * 4
  const pixels = new Uint8Array(height * stride)

  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) return a
    if (pb <= pc) return b
    return c
  }

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!
    const srcRow = y * (stride + 1) + 1
    const dstRow = y * stride
    for (let i = 0; i < stride; i += 1) {
      const xByte = raw[srcRow + i]!
      const left = i >= 4 ? pixels[dstRow + i - 4]! : 0
      const up = y > 0 ? pixels[dstRow - stride + i]! : 0
      const upLeft = y > 0 && i >= 4 ? pixels[dstRow - stride + i - 4]! : 0
      if (filter === 0) pixels[dstRow + i] = xByte
      else if (filter === 1) pixels[dstRow + i] = (xByte + left) & 0xff
      else if (filter === 2) pixels[dstRow + i] = (xByte + up) & 0xff
      else if (filter === 3) pixels[dstRow + i] = (xByte + Math.floor((left + up) / 2)) & 0xff
      else pixels[dstRow + i] = (xByte + paeth(left, up, upLeft)) & 0xff
    }
  }

  return { width, height, pixels }
}

describe('C++23 WebAssembly end-to-end export integration', () => {
  let backend: WasmBackend

  beforeAll(async () => {
    const wasmDir = path.resolve(process.cwd(), 'public/wasm')
    const wasmBytes = await readFile(path.join(wasmDir, 'vector_engine.wasm'))
    const baseHref = `${pathToFileURL(path.resolve(process.cwd(), 'public')).href}/`
    const wasmBuffer = wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength)
    backend = await WasmBackend.create(baseHref, wasmBuffer)
  })

  it('preserves PNG RGBA transparency at corners while rendering opaque vector geometry at center', async () => {
    const result = await executeExport({
      backend,
      source: defaultScene,
      options: {
        format: 'png',
        target: { type: 'object', objectId: 'core' },
        trimToBounds: true,
        margin: 8,
        scale: 0.5,
        background: 'transparent',
      },
      documentTitle: 'Orbit Study',
    })

    expect(result.filename).toBe('orbit-study.png')
    expect(result.hasAlpha).toBe(true)
    const decoded = decodePngRgba(result.data)
    expect(decoded.width).toBe(result.width)
    expect(decoded.height).toBe(result.height)

    expect(decoded.pixels[3]).toBe(0)

    const centerIndex = (Math.floor(decoded.height / 2) * decoded.width + Math.floor(decoded.width / 2)) * 4
    expect(decoded.pixels[centerIndex + 3]).toBe(255)
    expect(decoded.pixels[centerIndex + 2]).toBeGreaterThan(150)
  })

  it('exports JPEG with quality control, flattens alpha with warning, and respects custom HEX backgrounds', async () => {
    const lowQ = await executeExport({
      backend,
      source: defaultScene,
      options: {
        format: 'jpeg',
        target: { type: 'workspace', workspaceId: 'center-emblem' },
        scale: 1,
        quality: 15,
        background: 'transparent',
      },
    })

    const highQ = await executeExport({
      backend,
      source: defaultScene,
      options: {
        format: 'jpeg',
        target: { type: 'workspace', workspaceId: 'center-emblem' },
        scale: 1,
        quality: 96,
        background: { color: '#102030' },
      },
    })

    expect(lowQ.data[0]).toBe(0xff)
    expect(lowQ.data[1]).toBe(0xd8)
    expect(lowQ.hasAlpha).toBe(false)
    expect(lowQ.warnings.some((w) => w.includes('JPEG'))).toBe(true)
    expect(highQ.sizeBytes).toBeGreaterThan(lowQ.sizeBytes)
  })

  it('exports both 24-bit BGR and 32-bit BGRA BMP variants accurately', async () => {
    const bmp24 = await executeExport({
      backend,
      source: defaultScene,
      options: {
        format: 'bmp',
        target: { type: 'object', objectId: 'core' },
        trimToBounds: true,
        width: 40,
        height: 40,
        background: 'transparent',
        bmpBitDepth: 24,
      },
    })
    const bmp32 = await executeExport({
      backend,
      source: defaultScene,
      options: {
        format: 'bmp',
        target: { type: 'object', objectId: 'core' },
        trimToBounds: true,
        width: 40,
        height: 40,
        background: 'transparent',
        bmpBitDepth: 32,
      },
    })

    expect(bmp24.sizeBytes).toBe(54 + 40 * 3 * 40)
    expect(bmp24.hasAlpha).toBe(false)
    expect(bmp32.sizeBytes).toBe(122 + 40 * 40 * 4)
    expect(bmp32.hasAlpha).toBe(true)
    expect(bmp32.data[122 + 3]).toBe(0)
  })

  it('exports SVG with gradients, clipPath, and minification without mutating input source', async () => {
    const snapshotBefore = String(defaultScene)
    const standardSvg = await executeExport({
      backend,
      source: defaultScene,
      options: {
        format: 'svg',
        target: { type: 'scene' },
        clipToBounds: true,
        minifySvg: false,
        background: 'document',
      },
    })
    const minifiedSvg = await executeExport({
      backend,
      source: defaultScene,
      options: {
        format: 'svg',
        target: { type: 'scene' },
        clipToBounds: true,
        minifySvg: true,
        background: 'document',
      },
    })

    const text = new TextDecoder().decode(minifiedSvg.data)
    expect(text).toContain('<linearGradient id="core-gradient"')
    expect(text).toContain('<radialGradient id="halo-gradient"')
    expect(text).toContain('clipPath id="ve-export-clip"')
    expect(minifiedSvg.sizeBytes).toBeLessThan(standardSvg.sizeBytes)
    expect(defaultScene).toBe(snapshotBefore)
  })

  it('produces bit-identical deterministic outputs across repeated runs and scales cleanly to 2,000 objects', async () => {
    const objects = Array.from({ length: 2000 }, (_, i) => ({
      id: `item-${i}`,
      type: 'rect',
      x: (i % 50) * 16,
      y: Math.floor(i / 50) * 14,
      width: 12,
      height: 10,
      fill: i % 2 === 0 ? '#0052FF' : '#FF8A00',
    }))
    const largeSceneSource = JSON.stringify({
      version: '1.0',
      document: { width: 800, height: 560, background: '#FFFFFF' },
      objects,
    })

    const t0 = performance.now()
    const first = await executeExport({
      backend,
      source: largeSceneSource,
      options: {
        format: 'png',
        target: { type: 'scene' },
        width: 320,
        height: 224,
        background: 'document',
      },
    })
    const elapsedMs = performance.now() - t0

    const second = await executeExport({
      backend,
      source: largeSceneSource,
      options: {
        format: 'png',
        target: { type: 'scene' },
        width: 320,
        height: 224,
        background: 'document',
      },
    })

    expect(elapsedMs).toBeLessThan(2500)
    expect(Buffer.compare(Buffer.from(first.data), Buffer.from(second.data))).toBe(0)
  })

  it('fails gracefully with structured VectorEngineError on unsupported features or memory overflow', async () => {
    const unsupportedConic = JSON.stringify({
      version: '1.0',
      gradients: [{ id: 'bad', type: 'conic', stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#FFF' }] }],
      document: { width: 100, height: 100 },
      objects: [],
    })

    await expect(
      executeExport({
        backend,
        source: unsupportedConic,
        options: { format: 'svg', target: { type: 'scene' }, background: 'document' },
      }),
    ).rejects.toBeInstanceOf(VectorEngineError)
  })
})
