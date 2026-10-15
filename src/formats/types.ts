import type { DocumentIssue, VectorDocument } from '@/core/document'
import type { Result } from '@/core/result'

export const formatWarningCodes = [
  'legacy_format',
  'manifest_missing',
  'unknown_entries',
  'missing_assets',
  'assets_not_embedded',
  'alpha_flattened',
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
  inspect(document: VectorDocument): readonly FormatWarning[]
  write(document: VectorDocument, options?: WriteOptions): Promise<Blob>
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
