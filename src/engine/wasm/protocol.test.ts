import { describe, expect, it } from 'vitest'
import { cubicTo, lineTo, moveTo, closePath, identityMatrix } from '@/core/geometry'
import type { RenderScene } from '@/core/scene'
import { encodeRenderScene, PROTOCOL_VERSION, RenderStatus, renderStatusLabel } from './protocol'

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
