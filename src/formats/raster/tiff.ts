import { ByteWriter, assertPixelBuffer } from './binary'

export type TiffEncodeOptions = {
  readonly dpi?: number
}

const SHORT = 3
const LONG = 4
const RATIONAL = 5

const HEADER_SIZE = 8
const ENTRY_SIZE = 12
const ENTRY_COUNT = 14
const RATIONAL_SIZE = 8
const BITS_PER_SAMPLE_SIZE = 8
const DEFAULT_DPI = 72
const SAMPLES_PER_PIXEL = 4

const tags = {
  imageWidth: 256,
  imageLength: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  xResolution: 282,
  yResolution: 283,
  planarConfiguration: 284,
  resolutionUnit: 296,
  extraSamples: 338,
} as const

const values = {
  uncompressed: 1,
  rgb: 2,
  chunky: 1,
  inch: 2,
  unassociatedAlpha: 2,
} as const

type Entry = {
  readonly tag: number
  readonly type: number
  readonly count: number
  readonly value: number
}

const writeEntry = (writer: ByteWriter, entry: Entry): void => {
  writer.u16le(entry.tag).u16le(entry.type).u32le(entry.count)
  if (entry.type === SHORT && entry.count === 1) {
    writer.u16le(entry.value).u16le(0)
  } else {
    writer.u32le(entry.value)
  }
}

export const encodeTiff = (
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  options: TiffEncodeOptions = {},
): Uint8Array => {
  assertPixelBuffer(width, height, pixels)
  const ifdOffset = HEADER_SIZE
  const ifdSize = 2 + ENTRY_COUNT * ENTRY_SIZE + 4
  const bitsOffset = ifdOffset + ifdSize
  const xResolutionOffset = bitsOffset + BITS_PER_SAMPLE_SIZE
  const yResolutionOffset = xResolutionOffset + RATIONAL_SIZE
  const dataOffset = yResolutionOffset + RATIONAL_SIZE
  const dpi = Math.round(options.dpi && options.dpi > 0 ? options.dpi : DEFAULT_DPI)

  const entries: readonly Entry[] = [
    { tag: tags.imageWidth, type: LONG, count: 1, value: width },
    { tag: tags.imageLength, type: LONG, count: 1, value: height },
    { tag: tags.bitsPerSample, type: SHORT, count: SAMPLES_PER_PIXEL, value: bitsOffset },
    { tag: tags.compression, type: SHORT, count: 1, value: values.uncompressed },
    { tag: tags.photometric, type: SHORT, count: 1, value: values.rgb },
    { tag: tags.stripOffsets, type: LONG, count: 1, value: dataOffset },
    { tag: tags.samplesPerPixel, type: SHORT, count: 1, value: SAMPLES_PER_PIXEL },
    { tag: tags.rowsPerStrip, type: LONG, count: 1, value: height },
    { tag: tags.stripByteCounts, type: LONG, count: 1, value: pixels.length },
    { tag: tags.xResolution, type: RATIONAL, count: 1, value: xResolutionOffset },
    { tag: tags.yResolution, type: RATIONAL, count: 1, value: yResolutionOffset },
    { tag: tags.planarConfiguration, type: SHORT, count: 1, value: values.chunky },
    { tag: tags.resolutionUnit, type: SHORT, count: 1, value: values.inch },
    { tag: tags.extraSamples, type: SHORT, count: 1, value: values.unassociatedAlpha },
  ]

  const writer = new ByteWriter(dataOffset + pixels.length)
  writer.ascii('II').u16le(42).u32le(ifdOffset)
  writer.u16le(entries.length)
  entries.forEach((entry) => writeEntry(writer, entry))
  writer.u32le(0)
  for (let sample = 0; sample < SAMPLES_PER_PIXEL; sample += 1) {
    writer.u16le(8)
  }
  writer.u32le(dpi).u32le(1).u32le(dpi).u32le(1)
  writer.bytes(pixels)
  return writer.result()
}

export type TiffSummary = {
  readonly width: number
  readonly height: number
  readonly samplesPerPixel: number
  readonly compression: number
  readonly dpi: number
}

export const readTiffSummary = (bytes: Uint8Array): TiffSummary | undefined => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes.length < HEADER_SIZE ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x49 ||
    view.getUint16(2, true) !== 42
  ) {
    return undefined
  }
  const ifdOffset = view.getUint32(4, true)
  const count = view.getUint16(ifdOffset, true)
  const read = new Map<number, { type: number; count: number; value: number }>()
  for (let index = 0; index < count; index += 1) {
    const offset = ifdOffset + 2 + index * ENTRY_SIZE
    const type = view.getUint16(offset + 2, true)
    const entryCount = view.getUint32(offset + 4, true)
    const value =
      type === SHORT && entryCount === 1
        ? view.getUint16(offset + 8, true)
        : view.getUint32(offset + 8, true)
    read.set(view.getUint16(offset, true), { type, count: entryCount, value })
  }
  const resolution = read.get(tags.xResolution)
  const dpi = resolution
    ? view.getUint32(resolution.value, true) / view.getUint32(resolution.value + 4, true)
    : 0
  return {
    width: read.get(tags.imageWidth)?.value ?? 0,
    height: read.get(tags.imageLength)?.value ?? 0,
    samplesPerPixel: read.get(tags.samplesPerPixel)?.value ?? 0,
    compression: read.get(tags.compression)?.value ?? 0,
    dpi,
  }
}
