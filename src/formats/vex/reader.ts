import { unzipSync, type Unzipped } from 'fflate'
import { parseDocument, type DocumentIssue, type VectorDocument } from '@/core/document'
import { err, ok, type Result } from '@/core/result'
import {
  tryParseJson,
  type DocumentReader,
  type FormatWarning,
  type ImportFailure,
  type ImportResult,
  type ReadInput,
} from '../types'
import {
  VEX_EXTENSION,
  VEX_FORMAT_VERSION,
  VEX_MIME_TYPE,
  vexEntries,
  vexManifestSchema,
} from './manifest'

const FORMAT_ID = 'vex'
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]

const failure = (issues: DocumentIssue[]): Result<ImportResult, ImportFailure> =>
  err({ formatId: FORMAT_ID, issues })

const isZip = (bytes: Uint8Array): boolean =>
  ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte)

const unzip = (bytes: Uint8Array): Unzipped | undefined => {
  try {
    return unzipSync(bytes)
  } catch {
    return undefined
  }
}

const readManifest = (
  entries: Unzipped,
  warnings: FormatWarning[],
): Result<{ declaredAssets: string[] }, DocumentIssue[]> => {
  const raw = entries[vexEntries.manifest]
  if (!raw) {
    warnings.push({ code: 'manifest_missing' })
    return ok({ declaredAssets: [] })
  }
  const parsed = vexManifestSchema.safeParse(tryParseJson(raw))
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((issue) => ({
        path: `${vexEntries.manifest}:${issue.path.join('.')}`,
        message: issue.message,
      })),
    )
  }
  if (parsed.data.formatVersion > VEX_FORMAT_VERSION) {
    return err([
      {
        path: `${vexEntries.manifest}:formatVersion`,
        message: `Container version ${parsed.data.formatVersion} is newer than supported ${VEX_FORMAT_VERSION}`,
        reason: 'unsupported_schema_version',
      },
    ])
  }
  return ok({ declaredAssets: parsed.data.assets.map((asset) => asset.path) })
}

const collectEntryWarnings = (
  entries: Unzipped,
  document: VectorDocument,
  declaredAssets: readonly string[],
  warnings: FormatWarning[],
): void => {
  const known = new Set<string>([...Object.values(vexEntries), ...declaredAssets])
  const unknown = Object.keys(entries).filter((name) => !name.endsWith('/') && !known.has(name))
  if (unknown.length > 0) {
    warnings.push({ code: 'unknown_entries', detail: unknown.join(', ') })
  }
  const missing = document.assets
    .filter((asset) => !(asset.path in entries))
    .map((asset) => asset.path)
  if (missing.length > 0) {
    warnings.push({ code: 'missing_assets', detail: missing.join(', ') })
  }
}

export const vexReader: DocumentReader = {
  id: FORMAT_ID,
  label: 'Vector Engine project',
  extensions: [VEX_EXTENSION],
  mimeType: VEX_MIME_TYPE,
  matches: (input: ReadInput) => isZip(input.bytes),
  read(input: ReadInput): Promise<Result<ImportResult, ImportFailure>> {
    const entries = unzip(input.bytes)
    if (!entries) {
      return Promise.resolve(failure([{ path: '', message: 'File is not a valid ZIP container' }]))
    }
    const warnings: FormatWarning[] = []
    const manifest = readManifest(entries, warnings)
    if (!manifest.ok) {
      return Promise.resolve(failure(manifest.error))
    }
    const documentEntry = entries[vexEntries.document]
    if (!documentEntry) {
      return Promise.resolve(
        failure([
          { path: vexEntries.document, message: 'Container does not include document.json' },
        ]),
      )
    }
    const parsed = parseDocument(tryParseJson(documentEntry))
    if (!parsed.ok) {
      return Promise.resolve(failure(parsed.error))
    }
    collectEntryWarnings(entries, parsed.value, manifest.value.declaredAssets, warnings)
    return Promise.resolve(ok({ formatId: FORMAT_ID, document: parsed.value, warnings }))
  },
}
