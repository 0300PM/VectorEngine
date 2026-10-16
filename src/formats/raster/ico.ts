import { ByteWriter, assertPixelBuffer, concatBytes } from './binary'
import { encodePng, type PngEncodeOptions } from './png'

export const ICO_MAX_SIZE = 256
export const ICO_MAX_IMAGES = 65535
export const defaultIcoSizes = [16, 32, 48] as const

const HEADER_SIZE = 6
const ENTRY_SIZE = 16
const ICON_TYPE = 1
const COLOR_PLANES = 1
const BITS_PER_PIXEL = 32

export type IcoImage = {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8ClampedArray
}

export type IcoDirectoryEntry = {
  readonly width: number
  readonly height: number
  readonly bytesInResource: number
  readonly offset: number
}

export class IcoEncodeError extends RangeError {
  constructor(message: string) {
    super(message)
    this.name = 'IcoEncodeError'
  }
}

export const isValidIcoSize = (size: number): boolean =>
  Number.isInteger(size) && size > 0 && size <= ICO_MAX_SIZE

const validateImages = (images: readonly IcoImage[]): void => {
  if (images.length === 0 || images.length > ICO_MAX_IMAGES) {
    throw new IcoEncodeError(`ICO needs between 1 and ${ICO_MAX_IMAGES} images`)
  }
  const seen = new Set<string>()
  for (const image of images) {
    assertPixelBuffer(image.width, image.height, image.pixels)
    if (!isValidIcoSize(image.width) || !isValidIcoSize(image.height)) {
      throw new IcoEncodeError(
        `ICO images must be at most ${ICO_MAX_SIZE}×${ICO_MAX_SIZE} px, got ${image.width}×${image.height}`,
      )
    }
    const key = `${image.width}x${image.height}`
    if (seen.has(key)) {
      throw new IcoEncodeError(`Duplicate ICO image size ${key}`)
    }
    seen.add(key)
  }
}

const dimensionByte = (size: number): number => (size === ICO_MAX_SIZE ? 0 : size)

export const encodeIco = (
  images: readonly IcoImage[],
  options: PngEncodeOptions = {},
): Uint8Array => {
  validateImages(images)
  const encoded = images.map((image) => encodePng(image.width, image.height, image.pixels, options))
  const directory = new ByteWriter(HEADER_SIZE + ENTRY_SIZE * images.length)
  directory.u16le(0).u16le(ICON_TYPE).u16le(images.length)
  let offset = HEADER_SIZE + ENTRY_SIZE * images.length
  images.forEach((image, index) => {
    const bytes = encoded[index] ?? new Uint8Array(0)
    directory
      .u8(dimensionByte(image.width))
      .u8(dimensionByte(image.height))
      .u8(0)
      .u8(0)
      .u16le(COLOR_PLANES)
      .u16le(BITS_PER_PIXEL)
      .u32le(bytes.length)
      .u32le(offset)
    offset += bytes.length
  })
  return concatBytes([directory.result(), ...encoded])
}

export const readIcoDirectory = (bytes: Uint8Array): readonly IcoDirectoryEntry[] | undefined => {
  if (bytes.length < HEADER_SIZE) {
    return undefined
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== ICON_TYPE) {
    return undefined
  }
  const count = view.getUint16(4, true)
  if (bytes.length < HEADER_SIZE + count * ENTRY_SIZE) {
    return undefined
  }
  return Array.from({ length: count }, (_, index) => {
    const offset = HEADER_SIZE + index * ENTRY_SIZE
    const width = view.getUint8(offset)
    const height = view.getUint8(offset + 1)
    return {
      width: width === 0 ? ICO_MAX_SIZE : width,
      height: height === 0 ? ICO_MAX_SIZE : height,
      bytesInResource: view.getUint32(offset + 8, true),
      offset: view.getUint32(offset + 12, true),
    }
  })
}
