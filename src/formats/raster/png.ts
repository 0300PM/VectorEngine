import { zlibSync } from 'fflate'
import { ByteWriter, assertPixelBuffer, concatBytes, crc32 } from './binary'

export const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)

const INCHES_PER_METRE = 39.3701
const IHDR_LENGTH = 13
const IHDR_OFFSET = 8
const BIT_DEPTH = 8
const COLOR_TYPE_RGBA = 6

export type PngEncodeOptions = {
  readonly dpi?: number
}

export type PngHeader = {
  readonly width: number
  readonly height: number
  readonly bitDepth: number
  readonly colorType: number
}

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const body = new ByteWriter(4 + data.length).ascii(type).bytes(data).result()
  return new ByteWriter(12 + data.length).u32be(data.length).bytes(body).u32be(crc32(body)).result()
}

const filterScanlines = (width: number, height: number, pixels: Uint8ClampedArray): Uint8Array => {
  const stride = width * 4
  const filtered = new Uint8Array((stride + 1) * height)
  for (let row = 0; row < height; row += 1) {
    filtered.set(pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1)
  }
  return filtered
}

const physicalChunk = (dpi: number): Uint8Array => {
  const pixelsPerMetre = Math.round(dpi * INCHES_PER_METRE)
  return chunk('pHYs', new ByteWriter(9).u32be(pixelsPerMetre).u32be(pixelsPerMetre).u8(1).result())
}

export const encodePng = (
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  options: PngEncodeOptions = {},
): Uint8Array => {
  assertPixelBuffer(width, height, pixels)
  const header = new ByteWriter(IHDR_LENGTH)
    .u32be(width)
    .u32be(height)
    .u8(BIT_DEPTH)
    .u8(COLOR_TYPE_RGBA)
    .u8(0)
    .u8(0)
    .u8(0)
    .result()
  const parts = [PNG_SIGNATURE, chunk('IHDR', header)]
  if (options.dpi && options.dpi > 0) {
    parts.push(physicalChunk(options.dpi))
  }
  parts.push(chunk('IDAT', zlibSync(filterScanlines(width, height, pixels))))
  parts.push(chunk('IEND', new Uint8Array(0)))
  return concatBytes(parts)
}

export const readPngHeader = (bytes: Uint8Array): PngHeader | undefined => {
  if (bytes.length < IHDR_OFFSET + 8 + IHDR_LENGTH) {
    return undefined
  }
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    return undefined
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const dataOffset = IHDR_OFFSET + 8
  return {
    width: view.getUint32(dataOffset),
    height: view.getUint32(dataOffset + 4),
    bitDepth: view.getUint8(dataOffset + 8),
    colorType: view.getUint8(dataOffset + 9),
  }
}
