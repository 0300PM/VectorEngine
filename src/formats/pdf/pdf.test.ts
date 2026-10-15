import { unzlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createGroup,
  createLayer,
  createPath,
  createRectangle,
  createText,
  type VectorDocument,
} from '@/core/document'
import { closePath, cubicTo, lineTo, moveTo, quadraticTo, translation } from '@/core/geometry'
import {
  analyzeCompatibility,
  convertDocument,
  createDefaultFormatRegistry,
  decodeText,
} from '@/formats'
import { glyphNames } from './glyphs'
import { PdfFont, resolveStandardFont } from './fonts'
import { pdfLiteralString, pdfTextString } from './objects'
import { validatePdfStructure } from './validate'
import { buildPdf, createPdfWriter, pointsPerUnit } from './writer'

const latin1 = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')

const contentStream = (bytes: Uint8Array): string => {
  const text = latin1(bytes)
  const start = text.indexOf('stream\n') + 'stream\n'.length
  const end = text.indexOf('\nendstream', start)
  const raw = bytes.subarray(start, end)
  return text.includes('/FlateDecode') ? decodeText(unzlibSync(raw)) : decodeText(raw)
}

const imageNode = {
  id: 'img',
  type: 'image' as const,
  x: 0,
  y: 0,
  width: 5,
  height: 5,
  assetId: 'asset',
  opacity: 1,
  transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
}

const sampleDocument = (): VectorDocument =>
  createDocument({
    id: 'doc',
    name: 'Zażółć gęślą jaźń',
    width: 210,
    height: 297,
    unit: 'mm',
    background: 'rgba(255, 255, 255, 0.5)',
    metadata: { createdAt: '2026-10-15T10:20:30.000Z', generator: 'test' },
    layers: [
      createLayer(
        [
          createRectangle(
            { x: 10, y: 20, width: 50, height: 30 },
            { id: 'rect', cornerRadius: 5, style: { fill: { color: '#ff0000' } } },
          ),
          createPath(
            [
              moveTo(0, 0),
              lineTo(40, 0),
              quadraticTo(40, 40, 0, 40),
              cubicTo(0, 30, 0, 20, 0, 0),
              closePath(),
            ],
            {
              id: 'path',
              fillRule: 'evenodd',
              style: {
                fill: { color: 'rgba(0, 0, 255, 0.5)' },
                stroke: { color: '#000000', width: 2 },
              },
            },
          ),
          createText(
            {
              x: 20,
              y: 100,
              content: 'Zażółć → (ok) \\ done',
              font: { family: 'Inter', size: 12, weight: 700, style: 'normal' },
            },
            { id: 'text', style: { fill: { color: '#222222' } } },
          ),
          createGroup([createRectangle({ x: 0, y: 0, width: 1, height: 1 }, { id: 'inner' })], {
            id: 'group',
            opacity: 0.5,
            transform: translation(3, 4),
          }),
          imageNode,
        ],
        { id: 'layer-1', name: 'Main' },
      ),
      createLayer([createRectangle({ x: 0, y: 0, width: 1, height: 1 }, { id: 'hidden-rect' })], {
        id: 'layer-2',
        name: 'Hidden',
        visible: false,
      }),
    ],
    assets: [{ id: 'asset', kind: 'image', path: 'assets/a.png', mimeType: 'image/png' }],
  })

describe('pdf writer', () => {
  it('produces a structurally valid single page document with metadata', async () => {
    const writer = createPdfWriter({ now: () => new Date('2026-10-15T12:00:00Z') })
    const result = await writer.write(sampleDocument())
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    const text = latin1(bytes)

    expect(result.validation).toBe('passed')
    expect(validatePdfStructure(bytes)).toMatchObject({ ok: true, issues: [] })
    expect(text.startsWith('%PDF-1.4\n')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/MediaBox [0 0 595.2756 841.8898]')
    expect(text).toContain('/Count 1')
    expect(text).toContain(
      '/Title <FEFF005A0061017C00F301420107002000670119015B006C01050020006A0061017A0144>',
    )
    expect(text).toContain('/Producer (Vector Engine)')
    expect(text).toContain('/Creator (test)')
    expect(text).toContain('/CreationDate (D:20261015102030Z)')
    expect(text).toContain('/ModDate (D:20261015120000Z)')
    expect(text).toContain('/Filter /FlateDecode')
  })

  it('emits drawing operators for every supported node type', () => {
    const { bytes, result } = buildPdf(sampleDocument(), { compress: false })
    const content = contentStream(bytes)
    const scale = pointsPerUnit('mm')
    expect(
      content.startsWith(
        `${Number(scale.toFixed(4))} 0 0 -${Number(scale.toFixed(4))} 0 841.8898 cm`,
      ),
    ).toBe(true)
    expect(content).toContain('1 1 1 rg')
    expect(content).toContain('0 0 210 297 re')
    expect(content).toContain('/GS1 gs')
    expect(content).toContain(' c\n')
    expect(content).toContain('1 0 0 rg')
    expect(content).toContain('B*')
    expect(content).toContain('2 w\n1 J\n1 j')
    expect(content).toContain('BT\n/F1 12 Tf\n0 Tr\n1 0 0 -1 20 100 Tm\n')
    expect(content).toContain('Tj\nET')
    expect(content).toContain('q\n1 0 0 1 3 4 cm')
    expect(content).not.toContain('hidden-rect')

    expect(result.processedObjects).toBe(5)
    expect(result.skippedObjects).toBe(1)
    const kinds = result.transformations.map((transformation) => transformation.kind)
    expect(kinds).toEqual(
      expect.arrayContaining([
        'units_converted',
        'layers_flattened',
        'hidden_layers_omitted',
        'objects_skipped',
        'font_substituted',
        'text_encoded',
        'group_opacity_approximated',
      ]),
    )
    expect(kinds).not.toContain('content_compressed')
    expect(
      result.transformations.find((transformation) => transformation.kind === 'font_substituted')
        ?.detail,
    ).toBe('Inter → Helvetica-Bold')
    expect(
      result.transformations.find((transformation) => transformation.kind === 'text_encoded')
        ?.detail,
    ).toBe('→')
  })

  it('encodes non-ascii glyphs through a differences array and escapes literal strings', () => {
    const { bytes } = buildPdf(sampleDocument(), { compress: false })
    const text = latin1(bytes)
    expect(text).toContain('/BaseFont /Helvetica-Bold')
    expect(text).toContain('/Differences [128 /zdotaccent /oacute /lslash /cacute]')
    expect(contentStream(bytes)).toContain('(Za\\200\\201\\202\\203 ? \\(ok\\) \\\\ done) Tj')
  })

  it('compresses content streams losslessly by default', async () => {
    const compressed = await createPdfWriter().write(sampleDocument())
    const plain = buildPdf(sampleDocument(), { compress: false })
    const compressedBytes = new Uint8Array(await compressed.blob.arrayBuffer())
    expect(contentStream(compressedBytes)).toBe(contentStream(plain.bytes))
    expect(
      compressed.transformations.some(
        (transformation) => transformation.kind === 'content_compressed',
      ),
    ).toBe(true)
  })

  it('reports Display-P3 colours as converted and keeps pt documents unscaled', () => {
    const document = createDocument({
      id: 'd',
      name: 'P3',
      width: 100,
      height: 50,
      unit: 'pt',
      colorSpace: 'Display-P3',
    })
    const { bytes, result } = buildPdf(document, { compress: false })
    expect(latin1(bytes)).toContain('/MediaBox [0 0 100.0000 50.0000]')
    expect(contentStream(bytes).startsWith('1 0 0 -1 0 50 cm')).toBe(true)
    const kinds = result.transformations.map((transformation) => transformation.kind)
    expect(kinds).toContain('colors_converted')
    expect(kinds).not.toContain('units_converted')
    expect(kinds).not.toContain('layers_flattened')
  })

  it('fails validation when the cross reference table is corrupted', () => {
    const { bytes } = buildPdf(sampleDocument())
    const corrupted = bytes.slice()
    const xref = latin1(corrupted).lastIndexOf('xref\n0 ')
    corrupted.set([0x39, 0x39, 0x39], xref + 'xref\n0 9\n0000000000 65535 f \n'.length)
    const validation = validatePdfStructure(corrupted)
    expect(validation.ok).toBe(false)
    expect(validation.issues[0]).toMatch(/object 1 not found/)
    expect(validatePdfStructure(new Uint8Array(10)).ok).toBe(false)
  })
})

describe('pdf fonts and strings', () => {
  it('maps font descriptions onto the standard 14 faces', () => {
    expect(
      resolveStandardFont({ family: 'Helvetica', size: 1, weight: 400, style: 'normal' }),
    ).toEqual({
      baseFont: 'Helvetica',
      substituted: false,
    })
    expect(
      resolveStandardFont({ family: 'Georgia', size: 1, weight: 700, style: 'italic' }).baseFont,
    ).toBe('Times-BoldItalic')
    expect(
      resolveStandardFont({ family: 'JetBrains Mono', size: 1, weight: 400, style: 'italic' })
        .baseFont,
    ).toBe('Courier-Oblique')
    expect(
      resolveStandardFont({ family: 'Source Sans Pro', size: 1, weight: 500, style: 'normal' })
        .baseFont,
    ).toBe('Helvetica')
  })

  it('covers the whole latin-1 supplement and latin extended-a blocks', () => {
    for (let codePoint = 0xa0; codePoint <= 0x17f; codePoint += 1) {
      expect(glyphNames.get(codePoint), `U+${codePoint.toString(16)}`).toBeDefined()
    }
    expect(glyphNames.get(0x105)).toBe('aogonek')
    expect(glyphNames.get(0x20ac)).toBe('Euro')
  })

  it('falls back to question marks when the custom code range is exhausted', () => {
    const font = new PdfFont('F1', 'Helvetica')
    const everything = Array.from({ length: 0x17f - 0xa0 + 1 }, (_, index) =>
      String.fromCodePoint(0xa0 + index),
    ).join('')
    const encoded = font.encode(everything)
    expect(encoded.replaced.length).toBe(everything.length - 128)
    expect(font.encode('日本').replaced).toEqual(['日', '本'])
    expect(font.encode('tab\there').bytes).toEqual(new TextEncoder().encode('tab here'))
  })

  it('formats text strings as ascii literals or utf-16 hex', () => {
    expect(pdfTextString('plain (text)')).toBe('(plain \\(text\\))')
    expect(pdfTextString('ł')).toBe('<FEFF0142>')
    expect(pdfTextString('😀')).toBe('<FEFFD83DDE00>')
    expect(pdfLiteralString(Uint8Array.of(0x41, 0x0a, 0xff))).toBe('(A\\012\\377)')
  })
})

describe('pdf compatibility', () => {
  it('declares images as unsupported and reports them before conversion', async () => {
    const registry = createDefaultFormatRegistry()
    const writer = registry.findWriter('pdf')!
    const compatibility = analyzeCompatibility(sampleDocument(), writer)
    const image = compatibility.issues.find((issue) => issue.feature === 'image')
    expect(image?.severity).toBe('error')
    expect(image?.remedies).toContain('skip_objects')
    expect(compatibility.verdict).toBe('lossy')
    const outcome = await convertDocument(writer, sampleDocument(), {
      sourceFormat: 'vex',
      fileName: 'x.pdf',
    })
    expect(outcome.report.validation).toBe('passed')
    expect(outcome.report.skippedObjects).toBe(1)
    expect(outcome.report.issues.some((issue) => issue.feature === 'image')).toBe(true)
    expect(outcome.report.targetFormat).toBe('pdf')
  })
})
