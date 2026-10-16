import { describe, expect, it } from 'vitest'
import { createDocument, createLayer, createPath, createRectangle } from '@/core/document'
import { lineTo, moveTo } from '@/core/geometry'
import { createNodeExportContext } from '@/test-support/node-export'
import { createVariant } from '../export-set/variants'
import { readIcoDirectory } from '../raster/ico'
import { readPngHeader } from '../raster/png'
import {
  APP_ICON_INDEX_FILE,
  appIconExportSet,
  defaultAppIconOptions,
  runAppIconStudio,
} from './app-icons'
import {
  FAVICON_HTML_FILE,
  FAVICON_MANIFEST_FILE,
  defaultFaviconOptions,
  faviconExportSet,
  faviconHtml,
  requiredFaviconFiles,
  runFaviconStudio,
} from './favicon'
import { checkIconReadability } from './readability'
import { requireFiles } from './types'

const icon = createDocument({
  name: 'Icon',
  width: 64,
  height: 64,
  layers: [
    createLayer([
      createRectangle(
        { x: 8, y: 8, width: 48, height: 48 },
        { id: 'body', cornerRadius: 8, style: { fill: { color: '#1133aa' } } },
      ),
    ]),
  ],
})

const context = createNodeExportContext()

const bytesOf = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer())

describe('favicon studio', () => {
  it('produces the complete favicon set with manifest and html snippet', async () => {
    const options = { ...defaultFaviconOptions, appName: 'Vector', themeColor: '#112233' }
    const result = await runFaviconStudio(icon, options, context)
    expect(result.failures).toEqual([])
    expect(result.problems).toEqual([])
    expect(result.files.map((file) => file.fileName)).toEqual([
      'favicon.ico',
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-512.png',
      'icon.svg',
    ])
    const ico = readIcoDirectory(await bytesOf(result.files[0]!.blob))
    expect(ico?.map((entry) => entry.width)).toEqual([16, 32, 48])
    expect(readPngHeader(await bytesOf(result.files[1]!.blob))?.width).toBe(180)

    const manifest = JSON.parse(
      new TextDecoder().decode(
        await bytesOf(
          result.extras.find((extra) => extra.fileName === FAVICON_MANIFEST_FILE)!.blob,
        ),
      ),
    )
    expect(manifest.name).toBe('Vector')
    expect(manifest.icons.map((entry: { sizes: string }) => entry.sizes)).toEqual([
      '192x192',
      '512x512',
    ])
    expect(result.extras.some((extra) => extra.fileName === FAVICON_HTML_FILE)).toBe(true)
    expect(result.html).toContain('<link rel="manifest" href="/site.webmanifest">')
    expect(result.html).toContain('theme-color" content="#112233"')
  })

  it('lists required files and reports the missing ones', () => {
    const withoutSvg = { ...defaultFaviconOptions, includeSvg: false }
    expect(requiredFaviconFiles(withoutSvg)).toEqual([
      'favicon.ico',
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-512.png',
    ])
    expect(faviconExportSet(withoutSvg).variants).toHaveLength(4)
    expect(faviconHtml(withoutSvg)).not.toContain('image/svg+xml')
    expect(requireFiles([{ fileName: 'favicon.ico' }], requiredFaviconFiles(withoutSvg))).toEqual([
      { code: 'missing_file', detail: 'apple-touch-icon.png' },
      { code: 'missing_file', detail: 'icon-192.png' },
      { code: 'missing_file', detail: 'icon-512.png' },
    ])
  })
})

describe('app icon studio', () => {
  it('builds default, monochrome and dark variants with an index', async () => {
    const options = {
      ...defaultAppIconOptions,
      sizes: [48, 96],
      monochrome: '#ffffff',
      dark: { background: '#000000', recolor: '#ffffff' },
    }
    expect(appIconExportSet(options).variants.map((variant) => variant.fileName)).toEqual([
      'icon-48.png',
      'icon-96.png',
      'icon-monochrome-48.png',
      'icon-monochrome-96.png',
      'icon-dark-48.png',
      'icon-dark-96.png',
    ])
    const result = await runAppIconStudio(icon, options, context)
    expect(result.failures).toEqual([])
    expect(result.problems).toEqual([])
    expect(result.files).toHaveLength(6)
    const index = JSON.parse(
      new TextDecoder().decode(
        await bytesOf(result.extras.find((extra) => extra.fileName === APP_ICON_INDEX_FILE)!.blob),
      ),
    )
    expect(index.icons[2]).toEqual({
      src: 'icon-monochrome-48.png',
      sizes: '48x48',
      type: 'image/png',
      variant: 'monochrome',
    })
    expect(appIconExportSet(defaultAppIconOptions).variants).toHaveLength(8)
  })
})

describe('readability check', () => {
  const variant = createVariant({ format: 'png', background: { mode: 'transparent' } })

  it('flags icons that almost vanish at 16 px', async () => {
    const sparse = createDocument({
      width: 1000,
      height: 1000,
      layers: [
        createLayer([
          createRectangle(
            { x: 0, y: 0, width: 10, height: 10 },
            { style: { fill: { color: '#000000' } } },
          ),
        ]),
      ],
    })
    const problems = await checkIconReadability(sparse, variant, context)
    expect(problems.map((problem) => problem.code)).toEqual(['icon_sparse'])
    expect(await checkIconReadability(icon, variant, context)).toEqual([])
  })

  it('flags hairline strokes at 16 px', async () => {
    const hairline = createDocument({
      width: 1000,
      height: 1000,
      layers: [
        createLayer([
          createPath([moveTo(0, 0), lineTo(1000, 1000), lineTo(0, 1000), lineTo(0, 0)], {
            style: { fill: { color: '#000000' }, stroke: { color: '#ff0000', width: 2 } },
          }),
        ]),
      ],
    })
    const problems = await checkIconReadability(hairline, variant, context)
    expect(problems.map((problem) => problem.code)).toEqual(['strokes_too_thin'])
    expect(problems[0]?.detail).toBe('1 × <1px @ 16px')
  })
})
