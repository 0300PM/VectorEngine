import { countNodes, parseDocument, serializeDocument, type VectorDocument } from '@/core/document'
import { err, ok, type Result } from '@/core/result'
import { defineCapabilities } from '../compatibility/features'
import type { WriteResult } from '../compatibility/report'
import {
  bytesToBlob,
  encodeText,
  isRecord,
  tryParseJson,
  type DocumentReader,
  type DocumentWriter,
  type FormatWarning,
  type ImportFailure,
  type ImportResult,
  type ReadInput,
} from '../types'

const FORMAT_ID = 'document-json'
const MIME_TYPE = 'application/json'

const inspectAssets = (document: VectorDocument): FormatWarning[] =>
  document.assets.length > 0
    ? [
        {
          code: 'assets_not_embedded',
          detail: document.assets.map((asset) => asset.path).join(', '),
        },
      ]
    : []

export const documentJsonReader: DocumentReader = {
  id: FORMAT_ID,
  label: 'Vector document JSON',
  extensions: ['.json'],
  mimeType: MIME_TYPE,
  matches(input: ReadInput): boolean {
    const parsed = tryParseJson(input.bytes)
    return isRecord(parsed) && typeof parsed.schemaVersion === 'number'
  },
  read(input: ReadInput): Promise<Result<ImportResult, ImportFailure>> {
    const parsed = parseDocument(tryParseJson(input.bytes))
    if (!parsed.ok) {
      return Promise.resolve(err({ formatId: FORMAT_ID, issues: parsed.error }))
    }
    return Promise.resolve(
      ok({ formatId: FORMAT_ID, document: parsed.value, warnings: inspectAssets(parsed.value) }),
    )
  },
}

export const documentJsonWriter: DocumentWriter = {
  id: FORMAT_ID,
  label: 'Vector document JSON',
  extensions: ['.json'],
  mimeType: MIME_TYPE,
  capabilities: defineCapabilities('native', { assets: 'converted' }),
  write(document: VectorDocument): Promise<WriteResult> {
    return Promise.resolve({
      blob: bytesToBlob(encodeText(serializeDocument(document)), MIME_TYPE),
      processedObjects: countNodes(document),
      skippedObjects: 0,
      transformations: [],
      validation: 'passed',
    })
  },
}
