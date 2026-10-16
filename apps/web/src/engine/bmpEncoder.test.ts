import { describe, expect, it } from 'vitest'
import { encodeBmp24 } from './bmpEncoder'

describe('encodeBmp24', () => {
  it('writes a bottom-up aligned 24-bit bitmap', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 0,
    ])
    const bitmap = encodeBmp24(pixels, 2, 2)
    const view = new DataView(bitmap.buffer)

    expect(bitmap[0]).toBe(0x42)
    expect(bitmap[1]).toBe(0x4d)
    expect(view.getUint16(28, true)).toBe(24)
    expect(bitmap.byteLength).toBe(70)
    expect(Array.from(bitmap.slice(54, 57))).toEqual([255, 0, 0])
  })
})
