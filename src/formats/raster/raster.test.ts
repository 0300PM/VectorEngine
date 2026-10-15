import { describe, expect, it } from 'vitest'
import { flattenOntoWhite, inspectRasterExport } from './index'

const transparentScene = {
  width: 1,
  height: 1,
  background: { r: 0, g: 0, b: 0, a: 0 },
  items: [],
}

describe('raster export', () => {
  it('warns when alpha would be flattened', () => {
    expect(inspectRasterExport(transparentScene, 'jpeg')).toEqual([
      { code: 'alpha_flattened', detail: 'jpeg' },
    ])
    expect(inspectRasterExport(transparentScene, 'png')).toEqual([])
    expect(
      inspectRasterExport({ ...transparentScene, background: { r: 1, g: 1, b: 1, a: 1 } }, 'jpeg'),
    ).toEqual([])
  })

  it('composites translucent pixels onto white', () => {
    const flattened = flattenOntoWhite(new Uint8ClampedArray([0, 0, 0, 128, 255, 0, 0, 255]))
    expect(Array.from(flattened)).toEqual([127, 127, 127, 255, 255, 0, 0, 255])
  })
})
