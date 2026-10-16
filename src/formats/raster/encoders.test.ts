import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { crc32, fnv1a } from './binary'
import { IcoEncodeError, encodeIco, readIcoDirectory } from './ico'
import { encodePng, readPngHeader } from './png'
import { encodeTiff, readTiffSummary } from './tiff'

const gradient = (width: number, height: number): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = (index * 37) % 256
    pixels[index * 4 + 1] = (index * 59) % 256
    pixels[index * 4 + 2] = (index * 83) % 256
    pixels[index * 4 + 3] = index % 3 === 0 ? 0 : 255
  }
  return pixels
}

const findChunk = (bytes: Uint8Array, type: string): number => {
  const needle = new TextEncoder().encode(type)
  return Array.from(bytes).findIndex((_, start) =>
    needle.every((value, index) => bytes[start + index] === value),
  )
}

describe('checksums', () => {
  it('matches reference values', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(fnv1a(new TextEncoder().encode('a'))).toBe(0xe40c292c)
    expect(fnv1a(new Uint8Array(0))).toBe(0x811c9dc5)
  })
})

describe('png encoder', () => {
  it('round-trips pixels through a real decoder', async () => {
    const width = 5
    const height = 3
    const pixels = gradient(width, height)
    const bytes = encodePng(width, height, pixels)
    expect(readPngHeader(bytes)).toEqual({ width, height, bitDepth: 8, colorType: 6 })

    const image = await loadImage(bytes)
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const decoded = context.getImageData(0, 0, width, height).data
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 255) {
        expect(Array.from(decoded.slice(index, index + 4))).toEqual(
          Array.from(pixels.slice(index, index + 4)),
        )
      } else {
        expect(decoded[index + 3]).toBe(0)
      }
    }
  })

  it('stores physical resolution when a dpi is given', () => {
    const bytes = encodePng(1, 1, new Uint8ClampedArray([1, 2, 3, 4]), { dpi: 96 })
    const offset = findChunk(bytes, 'pHYs')
    expect(offset).toBeGreaterThan(0)
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 4)
    expect(view.getUint32(0)).toBe(3780)
    expect(view.getUint8(8)).toBe(1)
    expect(findChunk(encodePng(1, 1, new Uint8ClampedArray(4)), 'pHYs')).toBe(-1)
  })

  it('rejects mismatched buffers', () => {
    expect(() => encodePng(2, 2, new Uint8ClampedArray(4))).toThrow(RangeError)
    expect(() => encodePng(0, 2, new Uint8ClampedArray(0))).toThrow(RangeError)
    expect(readPngHeader(new Uint8Array(10))).toBeUndefined()
  })
})

describe('tiff encoder', () => {
  it('writes an uncompressed RGBA baseline file', () => {
    const pixels = gradient(4, 2)
    const bytes = encodeTiff(4, 2, pixels, { dpi: 300 })
    expect(readTiffSummary(bytes)).toEqual({
      width: 4,
      height: 2,
      samplesPerPixel: 4,
      compression: 1,
      dpi: 300,
    })
    expect(Array.from(bytes.slice(bytes.length - pixels.length))).toEqual(Array.from(pixels))
    expect(readTiffSummary(encodeTiff(1, 1, new Uint8ClampedArray(4)))?.dpi).toBe(72)
    expect(readTiffSummary(new Uint8Array([0x4d, 0x4d, 0, 42, 0, 0, 0, 8]))).toBeUndefined()
  })
})

describe('ico encoder', () => {
  it('embeds one PNG per size with a valid directory', () => {
    const sizes = [16, 32, 256]
    const bytes = encodeIco(
      sizes.map((size) => ({ width: size, height: size, pixels: gradient(size, size) })),
    )
    const directory = readIcoDirectory(bytes)!
    expect(directory.map((entry) => entry.width)).toEqual(sizes)
    directory.forEach((entry) => {
      const png = bytes.slice(entry.offset, entry.offset + entry.bytesInResource)
      expect(readPngHeader(png)?.width).toBe(entry.width)
    })
    expect(directory.at(-1)!.offset + directory.at(-1)!.bytesInResource).toBe(bytes.length)
  })

  it('rejects oversized, duplicated or missing images', () => {
    const image = { width: 16, height: 16, pixels: gradient(16, 16) }
    expect(() => encodeIco([])).toThrow(IcoEncodeError)
    expect(() => encodeIco([image, image])).toThrow(IcoEncodeError)
    expect(() =>
      encodeIco([{ width: 257, height: 257, pixels: new Uint8ClampedArray(257 * 257 * 4) }]),
    ).toThrow(IcoEncodeError)
    expect(readIcoDirectory(new Uint8Array([0, 0, 2, 0, 1, 0]))).toBeUndefined()
  })
})
