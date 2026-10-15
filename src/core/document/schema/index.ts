import type { z } from 'zod'
import { err, ok, type Result } from '@/core/result'
import { migrateDocument, type MigrationFailure } from '../migrations'
import type { VectorDocument } from '../types'
import { formatIssuePath, type DocumentIssue, type DocumentIssueReason } from './issues'
import { vectorDocumentSchemaV1 } from './v1'

export * from './issues'
export { SCHEMA_VERSION_1, vectorDocumentSchemaV1, type VectorDocumentInputV1 } from './v1'

const readReason = (issue: z.core.$ZodIssue): DocumentIssueReason | undefined => {
  if (issue.code !== 'custom') {
    return undefined
  }
  const reason = issue.params?.reason
  return typeof reason === 'string' ? (reason as DocumentIssueReason) : undefined
}

const toDocumentIssue = (issue: z.core.$ZodIssue): DocumentIssue => ({
  path: formatIssuePath(issue.path),
  message: issue.message,
  reason: readReason(issue),
})

const migrationIssue = (failure: MigrationFailure): DocumentIssue => ({
  path: 'schemaVersion',
  reason: failure.reason,
  message:
    failure.reason === 'missing_schema_version'
      ? 'Document is missing a valid schemaVersion'
      : `Schema version ${failure.version} is not supported`,
})

export const parseDocument = (input: unknown): Result<VectorDocument, DocumentIssue[]> => {
  const migrated = migrateDocument(input)
  if (!migrated.ok) {
    return err([migrationIssue(migrated.error)])
  }
  const parsed = vectorDocumentSchemaV1.safeParse(migrated.value)
  return parsed.success ? ok(parsed.data) : err(parsed.error.issues.map(toDocumentIssue))
}

export const parseDocumentJson = (text: string): Result<VectorDocument, DocumentIssue[]> => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON'
    return err([{ path: '', message, reason: 'invalid_json' }])
  }
  return parseDocument(raw)
}

export const serializeDocument = (document: VectorDocument): string =>
  JSON.stringify(document, null, 2)
