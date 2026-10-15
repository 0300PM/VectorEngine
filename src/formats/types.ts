import type { DocumentIssue, VectorDocument } from '@/core/document'
import type { Result } from '@/core/result'
import type { FormatCapabilities } from './compatibility/features'
import type { WriteResult } from './compatibility/report'

export const formatWarningCodes = [
  'legacy_format',
  'manifest_missing',
  'unknown_entries',
  'missing_assets',
  'assets_not_embedded',
  'svg_default_size',
  'svg_percentage_size',
  'svg_relative_units',
  'svg_unsupported_elements',
  'svg_css_ignored',
  'svg_effects_ignored',
  'svg_gradient_flattened',
  'svg_paint_server_unsupported',
  'svg_hidden_elements_omitted',
  'svg_degenerate_elements_omitted',
  'svg_elliptical_corners',
  'svg_text_spans_flattened',
  'svg_text_layout_ignored',
  'svg_dash_pattern_ignored',
  'svg_stroke_style_normalized',
  'svg_external_assets',
  'svg_duplicate_ids',
  'svg_preserve_aspect_ratio',
  'svg_invalid_paint',
  'svg_transform_ignored',
] as const

export type FormatWarningCode = (typeof formatWarningCodes)[number]

export type FormatWarning = {
  readonly code: FormatWarningCode
  readonly detail?: string
}

export type ImportResult = {
  readonly formatId: string
  readonly document: VectorDocument
  readonly warnings: readonly FormatWarning[]
}

export type ImportFailure = {
  readonly formatId: string
  readonly issues: readonly DocumentIssue[]
}

export type ReadInput = {
  readonly fileName: string
  readonly bytes: Uint8Array
}

export type FormatDescriptor = {
  readonly id: string
  readonly label: string
  readonly extensions: readonly string[]
  readonly mimeType: string
}

export interface DocumentReader extends FormatDescriptor {
  matches(input: ReadInput): boolean
  read(input: ReadInput): Promise<Result<ImportResult, ImportFailure>>
}

export type WriteOptions = {
  readonly thumbnail?: Uint8Array
}

export interface DocumentWriter extends FormatDescriptor {
  readonly capabilities: FormatCapabilities
  write(document: VectorDocument, options?: WriteOptions): Promise<WriteResult>
}

export const fileExtension = (fileName: string): string => {
  const index = fileName.lastIndexOf('.')
  return index === -1 ? '' : fileName.slice(index).toLowerCase()
}

export const hasExtension = (fileName: string, extensions: readonly string[]): boolean =>
  extensions.includes(fileExtension(fileName))

export const decodeText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

export const encodeText = (text: string): Uint8Array => new TextEncoder().encode(text)

export const bytesToBlob = (bytes: Uint8Array, type: string): Blob => {
  const part =
    bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes)
  return new Blob([part], { type })
}

export const tryParseJson = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(decodeText(bytes))
  } catch {
    return undefined
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
