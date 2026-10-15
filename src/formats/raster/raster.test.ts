import { describe, expect, it } from 'vitest'
import { createDocument, createGroup, createLayer, createRectangle } from '@/core/document'
import { analyzeRasterExport, flattenOntoWhite, rasterCapabilities } from './index'

const translucentDocument = createDocument({
  width: 10,
  height: 10,
  layers: [
    createLayer([
      createRectangle(
        { x: 0, y: 0, width: 5, height: 5 },
        { id: 'r', style: { fill: { color: '#ff000080' } } },
      ),
    ]),
  ],
})

describe('raster export', () => {
  it('reports flattened transparency only for formats without alpha', () => {
    const jpeg = analyzeRasterExport(translucentDocument, 'jpeg')
    expect(jpeg.issues.map((issue) => [issue.feature, issue.severity])).toEqual(
      expect.arrayContaining([
        ['colorAlpha', 'warning'],
        ['transparentBackground', 'warning'],
      ]),
    )
    expect(jpeg.issues.find((issue) => issue.feature === 'colorAlpha')?.remedies).toContain(
      'flatten_alpha',
    )
    const png = analyzeRasterExport(translucentDocument, 'png')
    expect(png.issues.some((issue) => issue.feature === 'colorAlpha')).toBe(false)
    expect(rasterCapabilities.webp.colorAlpha).toBe('native')
  })

  it('never suggests rasterising as a remedy for raster targets', () => {
    const grouped = createDocument({
      width: 10,
      height: 10,
      layers: [
        createLayer([
          createGroup(
            [
              createRectangle({ x: 0, y: 0, width: 5, height: 5 }, { id: 'a' }),
              createRectangle({ x: 2, y: 2, width: 5, height: 5 }, { id: 'b' }),
            ],
            { id: 'g', opacity: 0.5 },
          ),
        ]),
      ],
    })
    const issue = analyzeRasterExport(grouped, 'png').issues.find(
      (candidate) => candidate.feature === 'groupOpacity',
    )
    expect(issue?.remedies).toEqual(['choose_other_format'])
  })

  it('composites translucent pixels onto white', () => {
    const flattened = flattenOntoWhite(new Uint8ClampedArray([0, 0, 0, 128, 255, 0, 0, 255]))
    expect(Array.from(flattened)).toEqual([127, 127, 127, 255, 255, 0, 0, 255])
  })
})
