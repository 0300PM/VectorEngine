import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createGroup,
  createLayer,
  createRectangle,
  createText,
  type VectorDocument,
} from '@/core/document'
import { createNodeExportContext, createNodeRegistry } from '@/test-support/node-export'
import { readIcoDirectory } from '../raster/ico'
import { readPngHeader } from '../raster/png'
import { readTiffSummary } from '../raster/tiff'
import { planExportSet } from './plan'
import { builtInPresets, findBuiltInPreset } from './presets'
import { runExportSet } from './run'
import { parseExportPresets } from './schema'
import { scopeDocument } from './scope'
import { documentScope, type ExportSet } from './types'
import {
  createVariant,
  describeSize,
  scaledVariant,
  sizeForFormat,
  squareVariant,
} from './variants'

const registry = createNodeRegistry()

const logo: VectorDocument = createDocument({
  name: 'Brand Logo',
  width: 200,
  height: 100,
  background: '#ffffff',
  layers: [
    createLayer([
      createRectangle(
        { x: 20, y: 20, width: 60, height: 60 },
        { id: 'mark', style: { fill: { color: '#2255ff' } } },
      ),
      createRectangle(
        { x: 100, y: 40, width: 80, height: 20 },
        { id: 'word', style: { fill: { color: '#000000' } } },
      ),
    ]),
  ],
})

const bytesOf = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer())

const pixelAt = (pixels: Uint8ClampedArray, width: number, x: number, y: number): number[] => {
  const index = (y * width + x) * 4
  return Array.from(pixels.slice(index, index + 4))
}

describe('export plan', () => {
  it('derives file names, pixel sizes and compatibility per variant', () => {
    const preset = findBuiltInPreset('web-logo')!
    const plan = planExportSet(
      logo,
      { name: preset.name, variants: preset.variants, scope: documentScope },
      { baseName: 'brand-logo', registry },
    )
    expect(plan.ok).toBe(true)
    expect(plan.outputs.map((output) => output.fileName)).toEqual([
      'brand-logo.svg',
      'brand-logo-256.png',
      'brand-logo-512.png',
      'brand-logo-1024.png',
      'brand-logo.pdf',
    ])
    expect(plan.outputs[1]?.pixelSize).toEqual({ width: 256, height: 256 })
    expect(plan.outputs[0]?.pixelSize).toEqual({ width: 200, height: 100 })
    expect(plan.outputs.every((output) => output.compatibility)).toBe(true)
  })

  it('flags collisions, invalid sizes, oversized rasters and blocked variants', () => {
    const set: ExportSet = {
      name: 'broken',
      scope: documentScope,
      variants: [
        createVariant({ id: 'a', format: 'png', suffix: '-x' }),
        createVariant({ id: 'b', format: 'png', suffix: '-x' }),
        createVariant({ id: 'c', format: 'png', suffix: '-c', size: { mode: 'scale', factor: 0 } }),
        createVariant({
          id: 'd',
          format: 'png',
          suffix: '-d',
          size: { mode: 'fixed', width: 20000, height: 1 },
        }),
        createVariant({ id: 'e', format: 'ico', size: { mode: 'sizes', sizes: [16, 512] } }),
        createVariant({ id: 'f', format: 'ico', suffix: '-f', size: { mode: 'original' } }),
        createVariant({ id: 'g', format: 'svg', size: { mode: 'sizes', sizes: [16] } }),
      ],
    }
    const plan = planExportSet(logo, set, { baseName: 'x', registry })
    const problems = Object.fromEntries(
      plan.outputs.map((output) => [output.variantId, output.problems]),
    )
    expect(problems).toEqual({
      a: [],
      b: ['duplicate_file_name'],
      c: ['invalid_size'],
      d: ['size_too_large'],
      e: ['ico_size_out_of_range'],
      f: ['invalid_size'],
      g: ['invalid_size'],
    })
    expect(plan.ok).toBe(false)

    const textOnly = createDocument({
      width: 10,
      height: 10,
      layers: [
        createLayer([
          createText(
            {
              x: 0,
              y: 0,
              content: 'Hi',
              font: { family: 'Inter', size: 12, weight: 400, style: 'normal' },
            },
            { id: 't', style: { fill: { color: '#000000' } } },
          ),
        ]),
      ],
    })
    const blocked = planExportSet(
      textOnly,
      { name: 'png', scope: documentScope, variants: [createVariant({ id: 'p', format: 'png' })] },
      { baseName: 'text', registry },
    )
    expect(blocked.outputs[0]?.problems).toEqual(['blocked'])
  })

  it('crops the scope to the selected nodes with proportional padding', () => {
    const scoped = scopeDocument(logo, { kind: 'nodes', nodeIds: ['mark'], padding: 0.1 })
    expect(scoped.empty).toBe(false)
    expect(scoped.document.width).toBeCloseTo(72)
    expect(scoped.document.height).toBeCloseTo(72)
    const wrapper = scoped.document.layers[0]?.children[0]
    expect(wrapper?.type).toBe('group')
    expect(wrapper?.transform.e).toBeCloseTo(-14)
    expect(scopeDocument(logo, { kind: 'nodes', nodeIds: ['nope'], padding: 0 }).empty).toBe(true)
    const plan = planExportSet(
      logo,
      {
        name: 'empty',
        scope: { kind: 'nodes', nodeIds: ['nope'], padding: 0 },
        variants: [createVariant({ id: 'p' })],
      },
      { baseName: 'x', registry },
    )
    expect(plan.outputs[0]?.problems).toContain('empty_scope')
  })
})

describe('export run', () => {
  const context = createNodeExportContext()

  it('exports every variant of a set through the shared pipeline', async () => {
    const set: ExportSet = {
      name: 'mixed',
      scope: documentScope,
      variants: [
        createVariant({ id: 'svg', format: 'svg' }),
        createVariant({ id: 'pdf', format: 'pdf', size: { mode: 'scale', factor: 2 } }),
        squareVariant('png', 64, { id: 'png', background: { mode: 'transparent' }, padding: 0.25 }),
        scaledVariant('tiff', 0.5, { id: 'tiff', dpi: 300 }),
        createVariant({ id: 'jpeg', format: 'jpeg', quality: 0.5 }),
        createVariant({ id: 'ico', format: 'ico', size: { mode: 'sizes', sizes: [16, 32] } }),
      ],
    }
    const result = await runExportSet(logo, set, 'brand', context)
    expect(result.failures).toEqual([])
    expect(result.files.map((file) => file.fileName)).toEqual([
      'brand.svg',
      'brand.pdf',
      'brand-64.png',
      'brand@0.5x.tiff',
      'brand.jpg',
      'brand.ico',
    ])
    const byId = Object.fromEntries(result.files.map((file) => [file.variantId, file]))

    const png = await bytesOf(byId.png!.blob)
    expect(readPngHeader(png)).toMatchObject({ width: 64, height: 64 })
    expect(byId.png!.report.targetFormat).toBe('png')

    const tiff = readTiffSummary(await bytesOf(byId.tiff!.blob))
    expect(tiff).toMatchObject({ width: 100, height: 50, dpi: 300 })

    expect(readIcoDirectory(await bytesOf(byId.ico!.blob))?.map((entry) => entry.width)).toEqual([
      16, 32,
    ])
    expect(byId.ico!.report.validation).toBe('passed')
    expect(byId.ico!.report.transformations[0]).toEqual({ kind: 'rasterized', detail: '16, 32 px' })

    expect(byId.jpeg!.blob.type).toBe('image/jpeg')
    expect(byId.jpeg!.report.transformations.some((item) => item.kind === 'alpha_flattened')).toBe(
      true,
    )

    const svg = new TextDecoder().decode(await bytesOf(byId.svg!.blob))
    expect(svg).toContain('width="200"')
    expect(byId.pdf!.report.validation).toBe('passed')
    expect(byId.pdf!.blob.size).toBeGreaterThan(0)
  })

  it('keeps padding and background per variant in the rendered pixels', async () => {
    const renders: number[][] = []
    const probe = createNodeExportContext({
      render: async (scene) => {
        const result = await context.render(scene)
        renders.push(pixelAt(result.pixels, result.width, 0, 0))
        return result
      },
    })
    const set: ExportSet = {
      name: 'bg',
      scope: documentScope,
      variants: [
        squareVariant('png', 32, { id: 'transparent', background: { mode: 'transparent' } }),
        squareVariant('png', 32, {
          id: 'colored',
          background: { mode: 'color', color: '#00ff00' },
          suffix: '-green',
        }),
        squareVariant('png', 32, { id: 'mono', recolor: '#ff00ff', suffix: '-mono' }),
      ],
    }
    const result = await runExportSet(logo, set, 'bg', probe)
    expect(result.failures).toEqual([])
    expect(renders[0]).toEqual([0, 0, 0, 0])
    expect(renders[1]).toEqual([0, 255, 0, 255])
    expect(renders[2]).toEqual([255, 255, 255, 255])
  })

  it('records failures per variant and stops when cancelled', async () => {
    const controller = new AbortController()
    const set: ExportSet = {
      name: 'cancel',
      scope: documentScope,
      variants: [
        createVariant({ id: 'first', format: 'png' }),
        createVariant({ id: 'second', format: 'png', suffix: '-2' }),
        createVariant({
          id: 'bad',
          format: 'png',
          suffix: '-bad',
          size: { mode: 'scale', factor: -1 },
        }),
      ],
    }
    const failing = createNodeExportContext({
      render: async (scene) => {
        controller.abort()
        return context.render(scene)
      },
      signal: controller.signal,
    })
    const result = await runExportSet(logo, set, 'c', failing)
    expect(result.files.map((file) => file.variantId)).toEqual(['first'])
    expect(result.failures.map((failure) => failure.variantId)).toEqual(['second'])
    expect(result.failures[0]?.message).toBe('Export cancelled')

    const broken = await runExportSet(logo, set, 'c', context)
    expect(broken.failures).toEqual([
      { variantId: 'bad', fileName: 'c-bad.png', message: 'invalid_size' },
    ])
  })

  it('exports selected nodes with a cropped frame', async () => {
    const result = await runExportSet(
      logo,
      {
        name: 'crop',
        scope: { kind: 'nodes', nodeIds: ['mark'], padding: 0 },
        variants: [
          createVariant({ id: 'png', format: 'png' }),
          createVariant({ id: 'svg', format: 'svg' }),
        ],
      },
      'mark',
      context,
    )
    expect(result.failures).toEqual([])
    const png = await bytesOf(result.files[0]!.blob)
    expect(readPngHeader(png)).toMatchObject({ width: 60, height: 60 })
    const svg = new TextDecoder().decode(await bytesOf(result.files[1]!.blob))
    expect(svg).toContain('width="60"')
    expect(svg).not.toContain('id="word"')
  })
})

describe('presets', () => {
  it('ships valid built-in presets that survive serialisation', () => {
    expect(builtInPresets.map((preset) => preset.id)).toEqual([
      'web-logo',
      'raster-scales',
      'favicon',
    ])
    const parsed = parseExportPresets(JSON.parse(JSON.stringify(builtInPresets)))
    expect(parsed?.map((preset) => preset.variants.length)).toEqual([5, 3, 5])
    expect(parseExportPresets([{ id: 'x', name: 'x', variants: [] }])).toBeUndefined()
    expect(parseExportPresets('nope')).toBeUndefined()
  })

  it('describes sizes and adapts them to the format', () => {
    expect(describeSize({ mode: 'original' })).toBe('1:1')
    expect(describeSize({ mode: 'scale', factor: 2 })).toBe('2×')
    expect(describeSize({ mode: 'fixed', width: 1, height: 2 })).toBe('1×2')
    expect(describeSize({ mode: 'sizes', sizes: [16, 32] })).toBe('16/32')
    expect(sizeForFormat('ico', { mode: 'original' })).toEqual({
      mode: 'sizes',
      sizes: [16, 32, 48],
    })
    expect(sizeForFormat('png', { mode: 'sizes', sizes: [16] })).toEqual({ mode: 'original' })
    expect(sizeForFormat('png', { mode: 'scale', factor: 2 })).toEqual({ mode: 'scale', factor: 2 })
    expect(createVariant({ format: 'ico' }).size).toEqual({ mode: 'sizes', sizes: [16, 32, 48] })
  })

  it('reports group scopes through the shared document model', () => {
    const grouped = createDocument({
      width: 50,
      height: 50,
      layers: [
        createLayer([
          createGroup(
            [
              createRectangle(
                { x: 10, y: 10, width: 10, height: 10 },
                { id: 'inner', style: { fill: { color: '#000000' } } },
              ),
            ],
            { id: 'outer' },
          ),
        ]),
      ],
    })
    const scoped = scopeDocument(grouped, { kind: 'nodes', nodeIds: ['outer'], padding: 0 })
    expect(scoped.document.width).toBeCloseTo(10)
  })
})
