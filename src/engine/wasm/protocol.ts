import { pathCoordinateCount, type PathCommand } from '@/core/geometry'
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
