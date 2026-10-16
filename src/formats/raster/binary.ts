const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export const fnv1a = (bytes: Uint8Array): number => {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export class ByteWriter {
  readonly #bytes: Uint8Array
  readonly #view: DataView
  #offset = 0

  constructor(size: number) {
    this.#bytes = new Uint8Array(size)
    this.#view = new DataView(this.#bytes.buffer)
  }

  get offset(): number {
    return this.#offset
  }

  u8(value: number): this {
    this.#view.setUint8(this.#offset, value)
    this.#offset += 1
    return this
  }

  u16le(value: number): this {
    this.#view.setUint16(this.#offset, value, true)
    this.#offset += 2
    return this
  }

  u32le(value: number): this {
    this.#view.setUint32(this.#offset, value, true)
    this.#offset += 4
    return this
  }

  u32be(value: number): this {
    this.#view.setUint32(this.#offset, value, false)
    this.#offset += 4
    return this
  }

  ascii(text: string): this {
    for (let index = 0; index < text.length; index += 1) {
      this.u8(text.charCodeAt(index))
    }
    return this
  }

  bytes(source: ArrayLike<number>): this {
    this.#bytes.set(source, this.#offset)
    this.#offset += source.length
    return this
  }

  result(): Uint8Array {
    return this.#bytes
  }
}

export const concatBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

export const assertPixelBuffer = (
  width: number,
  height: number,
  pixels: ArrayLike<number>,
): void => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Invalid raster size ${width}×${height}`)
  }
  if (pixels.length !== width * height * 4) {
    throw new RangeError(
      `Pixel buffer has ${pixels.length} bytes, expected ${width * height * 4} for ${width}×${height} RGBA`,
    )
  }
}
