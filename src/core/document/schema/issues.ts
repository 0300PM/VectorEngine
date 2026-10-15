export const documentIssueReasons = [
  'invalid_color',
  'duplicate_id',
  'missing_schema_version',
  'unsupported_schema_version',
  'invalid_json',
] as const

export type DocumentIssueReason = (typeof documentIssueReasons)[number]

export type DocumentIssue = {
  readonly path: string
  readonly message: string
  readonly reason?: DocumentIssueReason
}

export const formatIssuePath = (segments: readonly PropertyKey[]): string =>
  segments.reduce<string>((path, segment) => {
    if (typeof segment === 'number') {
      return `${path}[${segment}]`
    }
    return path.length === 0 ? String(segment) : `${path}.${String(segment)}`
  }, '')
