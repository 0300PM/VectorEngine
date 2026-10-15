import {
  closePath,
  cubicTo,
  lineTo,
  moveTo,
  pathCoordinateCount,
  quadraticTo,
  type PathCommand,
} from '@/core/geometry'
import type { RenderScene } from '@/core/scene'

export const PROTOCOL_VERSION = 1

export const PathVerb = Object.freeze({
  move: 0,
  line: 1,
  quadratic: 2,
  cubic: 3,
  close: 4,
})

export const RenderStatus = Object.freeze({
  ok: 0,
  unsupportedProtocol: 1,
  truncatedBuffer: 2,
  invalidVerb: 3,
  invalidRenderer: 4,
  invalidValue: 5,
  bufferTooSmall: 6,
})

export type RenderStatusCode = (typeof RenderStatus)[keyof typeof RenderStatus]

export const renderStatusLabel = (code: number): string =>
  (Object.entries(RenderStatus) as [string, number][]).find(([, value]) => value === code)?.[0] ??
  `unknown(${code})`

const HEADER_LENGTH = 6
const ITEM_HEADER_LENGTH = 19

const verbCode = (command: PathCommand): number => {
  switch (command.type) {
    case 'M':
      return PathVerb.move
    case 'L':
      return PathVerb.line
    case 'Q':
      return PathVerb.quadratic
    case 'C':
      return PathVerb.cubic
    case 'Z':
      return PathVerb.close
  }
}

const commandLength = (command: PathCommand): number => 1 + pathCoordinateCount(command)

const sceneLength = (scene: RenderScene): number =>
  scene.items.reduce(
    (total, item) =>
      total +
      ITEM_HEADER_LENGTH +
      item.commands.reduce((sum, command) => sum + commandLength(command), 0),
    HEADER_LENGTH,
  )

class BufferWriter {
  readonly buffer: Float64Array
  #offset = 0

  constructor(length: number) {
    this.buffer = new Float64Array(length)
  }

  push(...values: readonly number[]): void {
    for (const value of values) {
      this.buffer[this.#offset] = value
      this.#offset += 1
    }
  }
}

const writeCommand = (writer: BufferWriter, command: PathCommand): void => {
  writer.push(verbCode(command))
  switch (command.type) {
    case 'M':
    case 'L':
      writer.push(command.x, command.y)
      break
    case 'Q':
      writer.push(command.x1, command.y1, command.x, command.y)
      break
    case 'C':
      writer.push(command.x1, command.y1, command.x2, command.y2, command.x, command.y)
      break
    case 'Z':
      break
  }
}

export const encodeRenderScene = (scene: RenderScene): Float64Array => {
  const writer = new BufferWriter(sceneLength(scene))
  const { background } = scene
  writer.push(PROTOCOL_VERSION, background.r, background.g, background.b, background.a)
  writer.push(scene.items.length)

  for (const item of scene.items) {
    const { a, b, c, d, e, f } = item.transform
    const fill = item.fill
    const stroke = item.stroke
    writer.push(a, b, c, d, e, f, item.opacity)
    writer.push(fill ? 1 : 0, fill?.r ?? 0, fill?.g ?? 0, fill?.b ?? 0, fill?.a ?? 0)
    writer.push(stroke ? 1 : 0, stroke?.color.r ?? 0, stroke?.color.g ?? 0, stroke?.color.b ?? 0)
    writer.push(stroke?.color.a ?? 0, stroke?.width ?? 0)
    writer.push(item.commands.length)
    item.commands.forEach((command) => writeCommand(writer, command))
  }

  return writer.buffer
}

export const PATH_MEASURE_LENGTH = 13

export type PathBounds = {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export type PathMeasure = {
  readonly length: number
  readonly controlBounds: PathBounds | undefined
  readonly exactBounds: PathBounds | undefined
  readonly subpathCount: number
  readonly degenerateSubpaths: number
  readonly selfIntersections: number
  readonly allClosed: boolean
}

const pathLength = (commands: readonly PathCommand[]): number =>
  commands.reduce((total, command) => total + commandLength(command), 1)

export const encodePathCommands = (commands: readonly PathCommand[]): Float64Array => {
  const writer = new BufferWriter(pathLength(commands))
  writer.push(commands.length)
  commands.forEach((command) => writeCommand(writer, command))
  return writer.buffer
}

export class PathDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathDecodeError'
  }
}

export const decodePathCommands = (buffer: ArrayLike<number>): PathCommand[] => {
  const read = (offset: number): number => {
    const value = buffer[offset]
    if (value === undefined || !Number.isFinite(value)) {
      throw new PathDecodeError(`Invalid value at offset ${offset}`)
    }
    return value
  }
  const count = read(0)
  const commands: PathCommand[] = []
  let offset = 1
  for (let index = 0; index < count; index += 1) {
    const verb = read(offset)
    offset += 1
    switch (verb) {
      case PathVerb.move:
        commands.push(moveTo(read(offset), read(offset + 1)))
        offset += 2
        break
      case PathVerb.line:
        commands.push(lineTo(read(offset), read(offset + 1)))
        offset += 2
        break
      case PathVerb.quadratic:
        commands.push(
          quadraticTo(read(offset), read(offset + 1), read(offset + 2), read(offset + 3)),
        )
        offset += 4
        break
      case PathVerb.cubic:
        commands.push(
          cubicTo(
            read(offset),
            read(offset + 1),
            read(offset + 2),
            read(offset + 3),
            read(offset + 4),
            read(offset + 5),
          ),
        )
        offset += 6
        break
      case PathVerb.close:
        commands.push(closePath())
        break
      default:
        throw new PathDecodeError(`Unknown verb ${verb} at offset ${offset - 1}`)
    }
  }
  if (offset !== buffer.length) {
    throw new PathDecodeError(`Trailing data after ${offset} values`)
  }
  return commands
}

const boundsFrom = (values: ArrayLike<number>, offset: number): PathBounds | undefined => {
  const bounds = {
    minX: values[offset] ?? 0,
    minY: values[offset + 1] ?? 0,
    maxX: values[offset + 2] ?? 0,
    maxY: values[offset + 3] ?? 0,
  }
  const empty = bounds.minX === 0 && bounds.minY === 0 && bounds.maxX === 0 && bounds.maxY === 0
  return empty ? undefined : bounds
}

export const decodePathMeasure = (values: ArrayLike<number>): PathMeasure => {
  if (values.length < PATH_MEASURE_LENGTH) {
    throw new PathDecodeError(`Measure buffer needs ${PATH_MEASURE_LENGTH} values`)
  }
  return {
    length: values[0] ?? 0,
    controlBounds: boundsFrom(values, 1),
    exactBounds: boundsFrom(values, 5),
    subpathCount: values[9] ?? 0,
    degenerateSubpaths: values[10] ?? 0,
    selfIntersections: values[11] ?? 0,
    allClosed: (values[12] ?? 0) === 1,
  }
}
