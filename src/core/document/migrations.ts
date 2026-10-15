import { err, ok, type Result } from '@/core/result'
import { SCHEMA_VERSION_1 } from './schema/v1'

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION_1

export type RawDocument = Record<string, unknown>

export type Migration = {
  readonly from: number
  readonly to: number
  readonly migrate: (raw: RawDocument) => RawDocument
}

export type MigrationFailure = {
  readonly reason: 'missing_schema_version' | 'unsupported_schema_version'
  readonly version?: number
}

const migrations: readonly Migration[] = []

const isRawDocument = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readSchemaVersion = (raw: RawDocument): number | undefined => {
  const version = raw.schemaVersion
  return typeof version === 'number' && Number.isInteger(version) && version > 0
    ? version
    : undefined
}

export const migrateDocument = (input: unknown): Result<RawDocument, MigrationFailure> => {
  if (!isRawDocument(input)) {
    return err({ reason: 'missing_schema_version' })
  }
  const version = readSchemaVersion(input)
  if (version === undefined) {
    return err({ reason: 'missing_schema_version' })
  }

  let current = input
  let currentVersion = version
  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const step = migrations.find((migration) => migration.from === currentVersion)
    if (!step) {
      return err({ reason: 'unsupported_schema_version', version })
    }
    current = { ...step.migrate(current), schemaVersion: step.to }
    currentVersion = step.to
  }

  return currentVersion === CURRENT_SCHEMA_VERSION
    ? ok(current)
    : err({ reason: 'unsupported_schema_version', version })
}
