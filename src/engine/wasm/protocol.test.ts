import { describe, expect, it } from 'vitest'
import { cubicTo, lineTo, moveTo, closePath, identityMatrix, quadraticTo } from '@/core/geometry'
import type { RenderScene } from '@/core/scene'
import {
  decodePathCommands,
  decodePathMeasure,
  encodePathCommands,
  encodeRenderScene,
  PATH_MEASURE_LENGTH,
  PathDecodeError,
  PROTOCOL_VERSION,
  RenderStatus,
  renderStatusLabel,
} from './protocol'

const scene: RenderScene = {
  width: 10,
  height: 10,
  background: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
  items: [
    {
      nodeId: 'a',
      commands: [moveTo(0, 0), lineTo(10, 0), cubicTo(10, 5, 5, 10, 0, 10), closePath()],
      transform: { ...identityMatrix, e: 5, f: 6 },
      fill: { r: 1, g: 0, b: 0, a: 1 },
      stroke: { color: { r: 0, g: 0, b: 1, a: 1 }, width: 3 },
      opacity: 0.5,
    },
  ],
}

describe('encodeRenderScene', () => {
  it('writes the versioned header, item header and verbs', () => {
    const buffer = Array.from(encodeRenderScene(scene))
    expect(buffer.slice(0, 6)).toEqual([PROTOCOL_VERSION, 0.1, 0.2, 0.3, 1, 1])
    expect(buffer.slice(6, 25)).toEqual([1, 0, 0, 1, 5, 6, 0.5, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 3, 4])
    expect(buffer.slice(25)).toEqual([0, 0, 0, 1, 10, 0, 3, 10, 5, 5, 10, 0, 10, 4])
  })

  it('encodes missing paints as zeroed slots', () => {
    const buffer = Array.from(
      encodeRenderScene({
        ...scene,
        items: [{ nodeId: 'b', commands: [], transform: identityMatrix, opacity: 1 }],
      }),
    )
    expect(buffer.slice(13, 25)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('labels status codes', () => {
    expect(renderStatusLabel(RenderStatus.invalidValue)).toBe('invalidValue')
    expect(renderStatusLabel(42)).toBe('unknown(42)')
  })
})

describe('path encoding', () => {
  const commands = [
    moveTo(0, 0),
    lineTo(10, 0),
    quadraticTo(10, 5, 5, 10),
    cubicTo(4, 9, 2, 8, 0, 10),
    closePath(),
  ]

  it('round-trips path commands through the shared verb encoding', () => {
    const encoded = encodePathCommands(commands)
    expect(Array.from(encoded)).toEqual([
      5, 0, 0, 0, 1, 10, 0, 2, 10, 5, 5, 10, 3, 4, 9, 2, 8, 0, 10, 4,
    ])
    expect(decodePathCommands(encoded)).toEqual(commands)
    expect(decodePathCommands(encodePathCommands([]))).toEqual([])
  })

  it('rejects malformed path buffers', () => {
    expect(() => decodePathCommands([1, 9])).toThrow(PathDecodeError)
    expect(() => decodePathCommands([1, 0, 1])).toThrow(PathDecodeError)
    expect(() => decodePathCommands([1, 4, 7])).toThrow(/Trailing/)
    expect(() => decodePathCommands([1, 0, Number.NaN, 1])).toThrow(PathDecodeError)
  })

  it('decodes measurement buffers', () => {
    const measure = decodePathMeasure([40, 0, 0, 10, 10, 0, 0, 10, 10, 1, 0, 2, 1])
    expect(measure).toEqual({
      length: 40,
      controlBounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      exactBounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      subpathCount: 1,
      degenerateSubpaths: 0,
      selfIntersections: 2,
      allClosed: true,
    })
    expect(
      decodePathMeasure(new Array<number>(PATH_MEASURE_LENGTH).fill(0)).controlBounds,
    ).toBeUndefined()
    expect(() => decodePathMeasure([1, 2, 3])).toThrow(PathDecodeError)
    expect(renderStatusLabel(RenderStatus.bufferTooSmall)).toBe('bufferTooSmall')
  })
})
