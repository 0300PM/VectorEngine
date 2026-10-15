import { zlibSync } from 'fflate'
import { parseColor } from '@/core/color'
import { pixelsPerUnit, type DocumentUnit, type VectorDocument } from '@/core/document'
import { defineCapabilities } from '../compatibility/features'
import type { Transformation, WriteResult } from '../compatibility/report'
import { bytesToBlob, encodeText, type DocumentWriter } from '../types'
import { ContentStreamBuilder } from './content'
import { PdfObjectTable, pdfDate, pdfTextString, streamObject } from './objects'
import { validatePdfStructure } from './validate'

export const PDF_FORMAT_ID = 'pdf'
export const PDF_MIME_TYPE = 'application/pdf'
export const PDF_PRODUCER = 'Vector Engine'

const POINTS_PER_PIXEL = 72 / 96

export const pointsPerUnit = (unit: DocumentUnit): number => pixelsPerUnit(unit) * POINTS_PER_PIXEL

export type PdfWriterOptions = {
  readonly compress?: boolean
  readonly now?: () => Date
}

const describeList = (items: readonly string[]): string =>
  items.length > 6 ? `${items.slice(0, 6).join(', ')} (+${items.length - 6})` : items.join(', ')

export const buildPdf = (
  document: VectorDocument,
  options: PdfWriterOptions = {},
): { readonly bytes: Uint8Array; readonly result: Omit<WriteResult, 'blob'> } => {
  const scale = pointsPerUnit(document.unit)
  const pageWidth = document.width * scale
  const pageHeight = document.height * scale
  const builder = new ContentStreamBuilder(scale, pageHeight)

  const background = document.background ? parseColor(document.background) : undefined
  if (background && background.a > 0) {
    builder.background(background, document.width, document.height)
  }
  const hiddenLayers = document.layers.filter((layer) => !layer.visible)
  document.layers.filter((layer) => layer.visible).forEach((layer) => builder.layer(layer))

  const { content, summary } = builder.finish()
  const rawContent = encodeText(content)
  const compress = options.compress ?? true
  const contentBytes = compress ? zlibSync(rawContent, { level: 6 }) : rawContent

  const objects = new PdfObjectTable()
  const catalog = objects.reserve()
  const pages = objects.reserve()
  const page = objects.reserve()
  const contents = objects.add(streamObject(compress ? '/Filter /FlateDecode' : '', contentBytes))
  const fontEntries = summary.fonts.fonts
    .map((font) => `/${font.resourceName} ${objects.add(font.dictionary())} 0 R`)
    .join(' ')
  const extGStateEntries = [...summary.extGStates.entries()]
    .map(
      ([name, state]) =>
        `/${name} << /Type /ExtGState /ca ${state.fillAlpha.toFixed(4)} /CA ${state.strokeAlpha.toFixed(4)} >>`,
    )
    .join(' ')
  const resources = [
    '/ProcSet [/PDF /Text]',
    fontEntries ? `/Font << ${fontEntries} >>` : '',
    extGStateEntries ? `/ExtGState << ${extGStateEntries} >>` : '',
  ]
    .filter(Boolean)
    .join(' ')

  objects.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`)
  objects.set(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`)
  objects.set(
    page,
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${pageWidth.toFixed(4)} ${pageHeight.toFixed(4)}] /Contents ${contents} 0 R /Resources << ${resources} >> >>`,
  )

  const now = (options.now ?? (() => new Date()))()
  const infoEntries = [
    `/Title ${pdfTextString(document.name)}`,
    `/Producer ${pdfTextString(PDF_PRODUCER)}`,
    document.metadata.generator ? `/Creator ${pdfTextString(document.metadata.generator)}` : '',
    pdfDate(document.metadata.createdAt, now)
      ? `/CreationDate ${pdfDate(document.metadata.createdAt, now)}`
      : '',
    `/ModDate ${pdfDate(document.metadata.modifiedAt, now) ?? pdfDate(undefined, now)}`,
  ]
    .filter(Boolean)
    .join(' ')
  const info = objects.add(`<< ${infoEntries} >>`)
  const bytes = objects.serialize(catalog, info)

  const transformations: Transformation[] = []
  if (document.unit !== 'pt') {
    transformations.push({
      kind: 'units_converted',
      detail: `${document.unit} → pt (×${scale.toFixed(4)})`,
    })
  }
  if (document.layers.length > 0) {
    transformations.push({ kind: 'layers_flattened', detail: `${document.layers.length}` })
  }
  if (hiddenLayers.length > 0) {
    transformations.push({
      kind: 'hidden_layers_omitted',
      detail: describeList(hiddenLayers.map((layer) => layer.name)),
    })
  }
  if (summary.skipped.length > 0) {
    transformations.push({ kind: 'objects_skipped', detail: describeList(summary.skipped) })
  }
  if (summary.fonts.substitutions.size > 0) {
    transformations.push({
      kind: 'font_substituted',
      detail: describeList(
        [...summary.fonts.substitutions.entries()].map(([from, to]) => `${from} → ${to}`),
      ),
    })
  }
  if (summary.replacedCharacters.length > 0) {
    transformations.push({ kind: 'text_encoded', detail: describeList(summary.replacedCharacters) })
  }
  if (summary.translucentGroups.length > 0) {
    transformations.push({
      kind: 'group_opacity_approximated',
      detail: describeList(summary.translucentGroups),
    })
  }
  if (document.colorSpace !== 'sRGB') {
    transformations.push({ kind: 'colors_converted', detail: `${document.colorSpace} → DeviceRGB` })
  }
  if (compress) {
    transformations.push({
      kind: 'content_compressed',
      detail: `${rawContent.byteLength} → ${contentBytes.byteLength} B`,
    })
  }

  const validation = validatePdfStructure(bytes)
  return {
    bytes,
    result: {
      processedObjects: summary.processed,
      skippedObjects: summary.skipped.length,
      transformations,
      validation: validation.ok ? 'passed' : 'failed',
    },
  }
}

export const createPdfWriter = (options: PdfWriterOptions = {}): DocumentWriter => ({
  id: PDF_FORMAT_ID,
  label: 'PDF',
  extensions: ['.pdf'],
  mimeType: PDF_MIME_TYPE,
  capabilities: defineCapabilities('native', {
    text: 'converted',
    image: 'unsupported',
    groupOpacity: 'converted',
    layers: 'dropped',
    hiddenLayers: 'dropped',
    lockedLayers: 'dropped',
    displayP3: 'converted',
    assets: 'dropped',
  }),
  write(document) {
    const { bytes, result } = buildPdf(document, options)
    return Promise.resolve({ blob: bytesToBlob(bytes, PDF_MIME_TYPE), ...result })
  },
})

export const pdfWriter = createPdfWriter()
