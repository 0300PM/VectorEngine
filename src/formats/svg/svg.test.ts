import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createLayer,
  createPath,
  createRectangle,
  createText,
  type VectorDocument,
  type VectorNode,
} from '@/core/document'
import {
  cubicTo,
  lineTo,
  moveTo,
  rotation,
  translation,
  multiply,
  closePath,
} from '@/core/geometry'
import { analyzeCompatibility, convertDocument, createDefaultFormatRegistry } from '@/formats'
import { parsePathData } from './path-data'
import { parseTransform } from './transform'
import { createSvgReader } from './reader'
import { createSvgWriter, serializeSvg } from './writer'
import type { XmlParser } from './xml'

const parse: XmlParser = (text) => {
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level === 'fatalError') {
        throw new SyntaxError(message)
      }
    },
  })
  return parser.parseFromString(text, 'image/svg+xml') as unknown as Document
}

const reader = createSvgReader(parse)
const writer = createSvgWriter({ parse })

const readSvg = async (text: string, fileName = 'sample.svg') => {
  const result = await reader.read({ fileName, bytes: new TextEncoder().encode(text) })
  if (!result.ok) {
    throw new Error(result.error.issues.map((issue) => issue.message).join('; '))
  }
  return result.value
}

const failSvg = async (text: string) => {
  const result = await reader.read({
    fileName: 'broken.svg',
    bytes: new TextEncoder().encode(text),
  })
  if (result.ok) {
    throw new Error('expected failure')
  }
  return result.error
}

const warningCodes = (warnings: readonly { code: string }[]): string[] =>
  warnings.map((warning) => warning.code)

const flatten = (nodes: readonly VectorNode[]): VectorNode[] =>
  nodes.flatMap((node) => (node.type === 'group' ? [node, ...flatten(node.children)] : [node]))

const sampleDocument = (): VectorDocument =>
  createDocument({
    id: 'doc',
    name: 'Round trip',
    width: 200,
    height: 100,
    unit: 'mm',
    background: '#ffffff',
    layers: [
      createLayer(
        [
          createRectangle(
            { x: 10, y: 20, width: 50, height: 30 },
            {
              id: 'rect-1',
              cornerRadius: 4,
              style: {
                fill: { color: 'rgba(255, 0, 0, 0.5)' },
                stroke: { color: '#0000ff', width: 2 },
              },
              transform: multiply(translation(5, 5), rotation(0.3)),
            },
          ),
          createPath([moveTo(0, 0), lineTo(40, 0), cubicTo(40, 20, 20, 40, 0, 40), closePath()], {
            id: 'path-1',
            fillRule: 'evenodd',
            style: { fill: { color: '#00ff00' } },
          }),
          createText(
            {
              x: 12,
              y: 80,
              content: 'Hello <svg> & friends',
              font: { family: 'Inter', size: 14, weight: 700, style: 'italic' },
            },
            { id: 'text-1', style: { fill: { color: '#222222' } } },
          ),
        ],
        { id: 'layer-1', name: 'Shapes' },
      ),
      createLayer([], { id: 'layer-2', name: 'Hidden', visible: false, locked: true }),
    ],
  })

describe('svg writer', () => {
  it('serializes a document and validates it with the injected parser', async () => {
    const result = await writer.write(sampleDocument())
    const text = await result.blob.text()
    expect(result.validation).toBe('passed')
    expect(text).toContain('width="200mm"')
    expect(text).toContain('viewBox="0 0 200 100"')
    expect(text).toContain('data-layer="Shapes"')
    expect(text).toContain('display="none"')
    expect(text).toContain('Hello &lt;svg&gt; &amp; friends')
    expect(text).toContain('fill-rule="evenodd"')
    expect(result.processedObjects).toBe(3)
    expect(result.transformations.map((transformation) => transformation.kind)).toContain(
      'layers_as_groups',
    )
  })

  it('reports validation as not verified when no parser is available', async () => {
    const result = await createSvgWriter().write(sampleDocument())
    expect(result.validation).toBe('not_verified')
  })

  it('skips images whose assets are missing and records them in the write result', async () => {
    const document = createDocument({
      id: 'doc',
      name: 'Image',
      width: 10,
      height: 10,
      layers: [
        createLayer(
          [
            {
              id: 'img',
              type: 'image',
              x: 0,
              y: 0,
              width: 5,
              height: 5,
              assetId: 'missing',
              opacity: 1,
              transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
            },
          ],
          { id: 'layer' },
        ),
      ],
    })
    const result = await writer.write(document)
    expect(result.skippedObjects).toBe(1)
    expect(
      result.transformations.some((transformation) => transformation.kind === 'objects_skipped'),
    ).toBe(true)
  })
})

describe('svg reader', () => {
  it('round-trips documents written by the svg writer', async () => {
    const original = sampleDocument()
    const imported = await readSvg(serializeSvg(original).text, 'round-trip.svg')
    const document = imported.document

    expect(document.name).toBe('Round trip')
    expect(document.unit).toBe('mm')
    expect(document.width).toBeCloseTo(200)
    expect(document.height).toBeCloseTo(100)
    expect(document.background).toBe('#ffffff')
    expect(document.layers.map((layer) => layer.name)).toEqual(['Shapes', 'Hidden'])
    expect(document.layers[1]?.visible).toBe(false)
    expect(document.layers[1]?.locked).toBe(true)

    const [rect, path, text] = document.layers[0]!.children
    expect(rect?.type).toBe('rectangle')
    if (rect?.type === 'rectangle') {
      expect(rect.x).toBeCloseTo(10)
      expect(rect.cornerRadius).toBeCloseTo(4)
      expect(rect.style.fill?.color).toBe('#ff000080')
      expect(rect.style.stroke).toEqual({ color: '#0000ff', width: 2 })
      expect(rect.transform.a).toBeCloseTo(Math.cos(0.3), 4)
      expect(rect.transform.e).toBeCloseTo(5, 4)
    }
    expect(path?.type).toBe('path')
    if (path?.type === 'path') {
      expect(path.geometry.fillRule).toBe('evenodd')
      expect(path.geometry.commands).toHaveLength(4)
    }
    expect(text?.type).toBe('text')
    if (text?.type === 'text') {
      expect(text.content).toBe('Hello <svg> & friends')
      expect(text.font).toEqual({ family: 'Inter', size: 14, weight: 700, style: 'italic' })
    }
    expect(imported.warnings).toEqual([])
  })

  it('maps viewBox scaling and offsets into node transforms', async () => {
    const imported = await readSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 100 100"><rect x="10" y="10" width="20" height="20"/></svg>',
    )
    const rect = imported.document.layers[0]?.children[0]
    expect(imported.document.width).toBe(400)
    expect(imported.document.height).toBe(200)
    expect(rect?.transform).toEqual({ a: 2, b: 0, c: 0, d: 2, e: 100, f: 0 })
  })

  it('uses physical units from the root size and warns about defaults and percentages', async () => {
    const physical = await readSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm"><rect width="96" height="96"/></svg>',
    )
    expect(physical.document.unit).toBe('mm')
    expect(physical.document.width).toBeCloseTo(210)
    expect(physical.document.layers[0]?.children[0]?.transform.a).toBeCloseTo(25.4 / 96)

    const defaulted = await readSvg('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>')
    expect(defaulted.document.width).toBe(300)
    expect(defaulted.document.height).toBe(150)
    expect(warningCodes(defaulted.warnings)).toContain('svg_default_size')

    const percentage = await readSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 50 20"><circle r="5"/></svg>',
    )
    expect(percentage.document.width).toBe(50)
    expect(warningCodes(percentage.warnings)).toContain('svg_percentage_size')
  })

  it('converts every basic shape, arcs and nested groups into document nodes', async () => {
    const imported = await readSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <g id="layer" data-layer="Main">
          <circle id="c" cx="10" cy="10" r="5" fill="red"/>
          <ellipse id="e" cx="20" cy="20" rx="5" ry="3"/>
          <line id="l" x1="0" y1="0" x2="10" y2="10" stroke="black" stroke-width="2"/>
          <polyline id="pl" points="0,0 10,0 10,10" fill="none" stroke="blue"/>
          <polygon id="pg" points="0 0 10 0 10 10"/>
          <path id="arc" d="M 10 10 A 5 5 0 0 1 20 10 Z"/>
          <g id="group" transform="translate(5 5)">
            <rect id="inner" width="4" height="4" transform="scale(2)"/>
          </g>
        </g>
      </svg>`)
    const layer = imported.document.layers[0]!
    expect(layer.name).toBe('Main')
    const nodes = flatten(layer.children)
    expect(nodes.map((node) => `${node.id}:${node.type}`)).toEqual([
      'c:ellipse',
      'e:ellipse',
      'l:path',
      'pl:path',
      'pg:path',
      'arc:path',
      'group:group',
      'inner:rectangle',
    ])
    const arc = nodes.find((node) => node.id === 'arc')
    if (arc?.type === 'path') {
      expect(arc.geometry.commands.some((command) => command.type === 'C')).toBe(true)
      expect(arc.geometry.commands.at(-1)?.type).toBe('Z')
    }
    const line = nodes.find((node) => node.id === 'l')
    if (line?.type === 'path') {
      expect(line.style.fill).toBeUndefined()
      expect(line.style.stroke).toEqual({ color: '#000000', width: 2 })
    }
    const polygon = nodes.find((node) => node.id === 'pg')
    if (polygon?.type === 'path') {
      expect(polygon.style.fill?.color).toBe('#000000')
      expect(polygon.geometry.commands.at(-1)?.type).toBe('Z')
    }
    const group = nodes.find((node) => node.id === 'group')
    const inner = nodes.find((node) => node.id === 'inner')
    expect(group?.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    expect(inner?.transform).toEqual({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 })
    expect(imported.warnings).toEqual([])
  })

  it('cascades presentation attributes, style attributes and currentColor', async () => {
    const imported = await readSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <g fill="#ff0000" stroke="currentColor" color="#00ff00" stroke-width="3" font-size="20" font-family="Georgia, serif">
          <rect id="a" width="10" height="10" style="fill: blue; fill-opacity: 0.5"/>
          <rect id="b" width="10" height="10" stroke-opacity="0.25"/>
          <text id="t" x="1" y="2" font-size="2em">  spaced   text </text>
        </g>
      </svg>`)
    const nodes = flatten(imported.document.layers[0]!.children)
    const a = nodes.find((node) => node.id === 'a')
    const b = nodes.find((node) => node.id === 'b')
    const t = nodes.find((node) => node.id === 't')
    if (a?.type === 'rectangle') {
      expect(a.style.fill?.color).toBe('#0000ff80')
      expect(a.style.stroke).toEqual({ color: '#00ff00', width: 3 })
    }
    if (b?.type === 'rectangle') {
      expect(b.style.fill?.color).toBe('#ff0000')
      expect(b.style.stroke?.color).toBe('#00ff0040')
    }
    expect(t?.type).toBe('text')
    if (t?.type === 'text') {
      expect(t.content).toBe('spaced text')
      expect(t.font.size).toBe(40)
      expect(t.font.family).toBe('Georgia')
    }
  })

  it('flattens gradients, substitutes unsupported paint servers and reports lossy constructs', async () => {
    const imported = await readSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100">
        <defs>
          <linearGradient id="grad"><stop offset="0" stop-color="#123456" stop-opacity="0.5"/><stop offset="1" stop-color="#fff"/></linearGradient>
          <pattern id="pat" width="4" height="4"><rect width="2" height="2"/></pattern>
          <filter id="blur"/>
        </defs>
        <style>.x { fill: red }</style>
        <rect id="g1" width="10" height="10" fill="url(#grad)"/>
        <rect id="p1" width="10" height="10" fill="url(#pat)" stroke="url(#nope)"/>
        <rect id="f1" width="10" height="10" filter="url(#blur)" stroke="black" stroke-dasharray="2 2" stroke-linejoin="miter"/>
        <rect id="hidden" width="10" height="10" display="none"/>
        <rect id="empty" width="0" height="10"/>
        <rect id="corner" width="10" height="10" rx="1" ry="3"/>
        <rect id="dup" width="1" height="1"/>
        <rect id="dup" width="1" height="1" fill="nonsense"/>
        <use xlink:href="#g1"/>
        <text id="txt" x="0" y="0" text-anchor="middle"><tspan x="5">a</tspan><tspan dy="2">b</tspan></text>
        <image id="img" width="10" height="10" xlink:href="data:image/png;base64,AAAA"/>
        <foreignObject width="1" height="1"/>
      </svg>`)
    const codes = warningCodes(imported.warnings)
    expect(codes).toEqual(
      expect.arrayContaining([
        'svg_css_ignored',
        'svg_gradient_flattened',
        'svg_paint_server_unsupported',
        'svg_effects_ignored',
        'svg_dash_pattern_ignored',
        'svg_stroke_style_normalized',
        'svg_hidden_elements_omitted',
        'svg_degenerate_elements_omitted',
        'svg_elliptical_corners',
        'svg_duplicate_ids',
        'svg_invalid_paint',
        'svg_unsupported_elements',
        'svg_text_spans_flattened',
        'svg_text_layout_ignored',
        'svg_external_assets',
      ]),
    )
    const nodes = flatten(imported.document.layers.flatMap((layer) => layer.children))
    const ids = nodes.map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('hidden')
    expect(ids).not.toContain('empty')
    const gradient = nodes.find((node) => node.id === 'g1')
    if (gradient?.type === 'rectangle') {
      expect(gradient.style.fill?.color).toBe('#12345680')
    }
    const pattern = nodes.find((node) => node.id === 'p1')
    if (pattern?.type === 'rectangle') {
      expect(pattern.style.fill?.color).toBe('#808080')
      expect(pattern.style.stroke?.color).toBe('#808080')
    }
    const text = nodes.find((node) => node.id === 'txt')
    if (text?.type === 'text') {
      expect(text.content).toBe('ab')
    }
    const image = nodes.find((node) => node.id === 'img')
    expect(image?.type).toBe('image')
    expect(imported.document.assets).toHaveLength(1)
    expect(imported.document.assets[0]?.mimeType).toBe('image/png')
    const unsupported = imported.warnings.find(
      (warning) => warning.code === 'svg_unsupported_elements',
    )
    expect(unsupported?.detail).toContain('use')
    expect(unsupported?.detail).toContain('foreignObject')
  })

  it('rejects malformed xml and non-svg roots without throwing', async () => {
    const malformed = await failSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>')
    expect(malformed.formatId).toBe('svg')
    expect(malformed.issues.length).toBeGreaterThan(0)

    const wrongRoot = await failSvg('<html><body/></html>')
    expect(wrongRoot.issues[0]?.message).toContain('<svg>')
  })

  it('tolerates malformed transforms and path data instead of failing the import', async () => {
    const imported = await readSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
        <rect id="r" width="5" height="5" transform="rotate(abc)"/>
        <path id="bad" d="M 0 0 L 10 10 Q 5"/>
        <path id="good" d="M0,0h10v10h-10z"/>
      </svg>`)
    const ids = flatten(imported.document.layers.flatMap((layer) => layer.children)).map(
      (node) => node.id,
    )
    expect(ids).toEqual(['r', 'good'])
    const codes = warningCodes(imported.warnings)
    expect(codes).toContain('svg_transform_ignored')
    expect(codes).toContain('svg_degenerate_elements_omitted')
  })
})

describe('svg primitives', () => {
  it('parses the full transform grammar', () => {
    expect(parseTransform('translate(10,20) scale(2) rotate(90 1 1) skewX(0)').malformed).toBe(
      false,
    )
    expect(parseTransform('matrix(1 0 0 1 5 6)').matrix).toEqual({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 5,
      f: 6,
    })
    expect(parseTransform('rotate(90)').matrix.b).toBeCloseTo(1)
    expect(parseTransform('bogus(1)').malformed).toBe(true)
  })

  it('parses path data including relative commands, shorthands and arcs', () => {
    const commands = parsePathData(
      'M10 10 h 10 v 10 H 0 V 0 q 5 5 10 0 t 10 0 s 5 5 10 0 a 5 5 0 1 0 10 0 z',
    )
    expect(commands[0]).toEqual({ type: 'M', x: 10, y: 10 })
    expect(commands.filter((command) => command.type === 'C').length).toBeGreaterThan(1)
    expect(commands.at(-1)?.type).toBe('Z')
    expect(() => parsePathData('M 1')).toThrow()
    expect(parsePathData('')).toEqual([])
  })
})

describe('svg registry integration', () => {
  it('detects svg files by extension and content and converts through the compatibility pipeline', async () => {
    const registry = createDefaultFormatRegistry({ xmlParser: parse })
    const bytes = new TextEncoder().encode(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    )
    expect(registry.findReader({ fileName: 'x.svg', bytes })?.id).toBe('svg')
    expect(registry.acceptedFileTypes()).toContain('.svg')

    const svgWriter = registry.findWriter('svg')!
    const document = sampleDocument()
    const compatibility = analyzeCompatibility(document, svgWriter)
    expect(compatibility.verdict).not.toBe('blocked')
    const outcome = await convertDocument(svgWriter, document, {
      sourceFormat: 'vex',
      fileName: 'round-trip.svg',
    })
    expect(outcome.report.validation).toBe('passed')
    expect(outcome.report.transformations.map((transformation) => transformation.kind)).toContain(
      'layers_as_groups',
    )
    const written = {
      fileName: 'round-trip.svg',
      bytes: new Uint8Array(await outcome.blob.arrayBuffer()),
    }
    const reimported = await registry.findReader(written)!.read(written)
    expect(reimported.ok).toBe(true)
  })
})
