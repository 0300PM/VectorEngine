import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createGroup,
  createLayer,
  createPath,
  createRectangle,
  createText,
} from '@/core/document'
import { lineTo, moveTo } from '@/core/geometry'
import { analyzeCompatibility } from './analyze'
import {
  buildConversionReport,
  conversionReportBlob,
  conversionReportFileName,
  serializeConversionReport,
} from './convert'
import { defineCapabilities, documentFeatures } from './features'
import { collectRequirements } from './requirements'

const font = { family: 'Inter', size: 14, weight: 400, style: 'normal' as const }

const richDocument = () =>
  createDocument({
    width: 100,
    height: 100,
    unit: 'mm',
    colorSpace: 'Display-P3',
    background: null,
    assets: [{ id: 'asset_1', kind: 'image', path: 'assets/a.png', mimeType: 'image/png' }],
    layers: [
      createLayer(
        [
          createRectangle(
            { x: 0, y: 0, width: 10, height: 10 },
            { id: 'rect', cornerRadius: 2, style: { fill: { color: '#ff000080' } } },
          ),
          createText({ x: 0, y: 0, content: 'Hi', font }, { id: 'text' }),
          createGroup(
            [
              createPath([moveTo(0, 0), lineTo(1, 1)], {
                id: 'path',
                fillRule: 'evenodd',
                style: { stroke: { color: '#000', width: 1 } },
              }),
              createRectangle({ x: 0, y: 0, width: 1, height: 1 }, { id: 'rect2' }),
            ],
            { id: 'group', opacity: 0.5 },
          ),
        ],
        { id: 'layer', locked: true },
      ),
      createLayer([], { id: 'hidden', visible: false }),
    ],
  })

describe('collectRequirements', () => {
  it('detects used features with their subjects', () => {
    const requirements = collectRequirements(richDocument())
    expect(requirements.get('text')?.subjects).toEqual(['text'])
    expect(requirements.get('cornerRadius')?.subjects).toEqual(['rect'])
    expect(requirements.get('colorAlpha')?.subjects).toEqual(['rect'])
    expect(requirements.get('evenodd')?.subjects).toEqual(['path'])
    expect(requirements.get('groupOpacity')?.subjects).toEqual(['group'])
    expect(requirements.get('hiddenLayers')?.subjects).toEqual(['hidden'])
    expect(requirements.get('lockedLayers')?.subjects).toEqual(['layer'])
    expect(requirements.get('physicalUnits')?.detail).toBe('mm')
    expect(requirements.get('displayP3')).toBeDefined()
    expect(requirements.get('transparentBackground')).toBeDefined()
    expect(requirements.get('assets')?.subjects).toEqual(['asset_1'])
    expect(requirements.has('image')).toBe(false)
  })
})

describe('analyzeCompatibility', () => {
  it('reports nothing for a fully native target', () => {
    const report = analyzeCompatibility(richDocument(), {
      id: 'native',
      label: 'Native',
      capabilities: defineCapabilities('native'),
    })
    expect(report.issues).toEqual([])
    expect(report.verdict).toBe('faithful')
  })

  it('maps support levels to severities by feature class', () => {
    const report = analyzeCompatibility(richDocument(), {
      id: 'lossy',
      label: 'Lossy',
      capabilities: defineCapabilities('native', {
        text: 'unsupported',
        evenodd: 'converted',
        layers: 'dropped',
        physicalUnits: 'converted',
        displayP3: 'converted',
        assets: 'dropped',
        groupOpacity: 'converted',
      }),
    })
    const bySeverity = Object.fromEntries(
      report.issues.map((issue) => [issue.feature, issue.severity]),
    )
    expect(bySeverity).toEqual({
      text: 'error',
      evenodd: 'warning',
      layers: 'info',
      physicalUnits: 'info',
      displayP3: 'warning',
      assets: 'warning',
      groupOpacity: 'warning',
    })
    expect(report.issues[0]?.feature).toBe('text')
    expect(report.issues.find((issue) => issue.feature === 'text')?.remedies).toEqual([
      'skip_objects',
      'choose_other_format',
      'cancel',
    ])
    expect(report.summary).toEqual({ info: 2, warning: 4, error: 1, critical: 0 })
    expect(report.verdict).toBe('lossy')
  })

  it('flags a critical issue when no visible object can be represented', () => {
    const document = createDocument({
      width: 10,
      height: 10,
      layers: [createLayer([createText({ x: 0, y: 0, content: 'Only text', font })])],
    })
    const report = analyzeCompatibility(document, {
      id: 'png',
      label: 'PNG',
      capabilities: defineCapabilities('native', { text: 'unsupported' }),
    })
    expect(report.verdict).toBe('blocked')
    expect(report.issues[0]).toMatchObject({ feature: 'output', severity: 'critical' })
  })

  it('covers every feature in capability tables', () => {
    const capabilities = defineCapabilities('dropped', { text: 'native' })
    expect(Object.keys(capabilities).sort()).toEqual([...documentFeatures].sort())
    expect(capabilities.text).toBe('native')
    expect(capabilities.path).toBe('dropped')
  })
})

describe('buildConversionReport', () => {
  it('combines the compatibility analysis with writer results', () => {
    const compatibility = analyzeCompatibility(richDocument(), {
      id: 'pdf',
      label: 'PDF',
      capabilities: defineCapabilities('native', { text: 'converted', image: 'unsupported' }),
    })
    const report = buildConversionReport(
      { sourceFormat: 'document', fileName: 'out.pdf' },
      compatibility,
      {
        processedObjects: 4,
        skippedObjects: 0,
        transformations: [{ kind: 'font_substituted', detail: 'Inter → Helvetica' }],
        validation: 'passed',
      },
      new Date('2026-01-01T00:00:00.000Z'),
    )
    expect(report).toMatchObject({
      sourceFormat: 'document',
      targetFormat: 'pdf',
      fileName: 'out.pdf',
      createdAt: '2026-01-01T00:00:00.000Z',
      processedObjects: 4,
      warningCount: 1,
      validation: 'passed',
    })
    expect(report.transformations[0]?.kind).toBe('font_substituted')
  })
})

describe('conversion report serialization', () => {
  it('serializes reports as versioned json with a derived file name', async () => {
    const report = buildConversionReport(
      { sourceFormat: 'document', fileName: 'poster.pdf' },
      analyzeCompatibility(createDocument({ id: 'd', name: 'Poster', width: 10, height: 10 }), {
        id: 'pdf',
        label: 'PDF',
        capabilities: defineCapabilities('native'),
      }),
      { processedObjects: 0, skippedObjects: 0, transformations: [], validation: 'passed' },
      new Date('2026-10-15T00:00:00Z'),
    )
    const parsed = JSON.parse(serializeConversionReport(report)) as Record<string, unknown>
    expect(parsed['reportVersion']).toBe(1)
    expect(parsed['targetFormat']).toBe('pdf')
    expect(parsed['createdAt']).toBe('2026-10-15T00:00:00.000Z')
    expect(conversionReportFileName(report)).toBe('poster.pdf-report.json')
    expect(await conversionReportBlob(report).text()).toBe(serializeConversionReport(report))
  })
})
