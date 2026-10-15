import type { DocumentFeature, FeatureSupport } from './features'

export const issueSeverities = ['info', 'warning', 'error', 'critical'] as const
export type IssueSeverity = (typeof issueSeverities)[number]

export const remedies = [
  'skip_objects',
  'rasterize',
  'flatten_alpha',
  'convert_units',
  'substitute_font',
  'convert_colors',
  'choose_other_format',
  'cancel',
] as const
export type Remedy = (typeof remedies)[number]

export type CompatibilityIssue = {
  readonly feature: DocumentFeature | 'output'
  readonly support: FeatureSupport
  readonly severity: IssueSeverity
  readonly subjects: readonly string[]
  readonly count: number
  readonly remedies: readonly Remedy[]
  readonly detail?: string
}

export const verdicts = ['faithful', 'lossy', 'blocked'] as const
export type Verdict = (typeof verdicts)[number]

export type CompatibilityReport = {
  readonly targetId: string
  readonly targetLabel: string
  readonly issues: readonly CompatibilityIssue[]
  readonly summary: Readonly<Record<IssueSeverity, number>>
  readonly verdict: Verdict
}

export const transformationKinds = [
  'units_converted',
  'alpha_flattened',
  'rasterized',
  'font_substituted',
  'text_encoded',
  'group_opacity_approximated',
  'colors_converted',
  'hidden_layers_omitted',
  'fill_rule_converted',
  'objects_skipped',
  'layers_flattened',
  'layers_as_groups',
  'metadata_reduced',
  'gradients_flattened',
  'content_compressed',
] as const
export type TransformationKind = (typeof transformationKinds)[number]

export type Transformation = {
  readonly kind: TransformationKind
  readonly detail?: string
}

export const validationStatuses = ['passed', 'failed', 'not_verified'] as const
export type ValidationStatus = (typeof validationStatuses)[number]

export type WriteResult = {
  readonly blob: Blob
  readonly processedObjects: number
  readonly skippedObjects: number
  readonly transformations: readonly Transformation[]
  readonly validation: ValidationStatus
}

export type ConversionReport = {
  readonly sourceFormat: string
  readonly targetFormat: string
  readonly fileName: string
  readonly createdAt: string
  readonly processedObjects: number
  readonly skippedObjects: number
  readonly warningCount: number
  readonly issues: readonly CompatibilityIssue[]
  readonly transformations: readonly Transformation[]
  readonly validation: ValidationStatus
}

export const emptySummary = (): Record<IssueSeverity, number> => ({
  info: 0,
  warning: 0,
  error: 0,
  critical: 0,
})

export const summarize = (issues: readonly CompatibilityIssue[]): Record<IssueSeverity, number> =>
  issues.reduce((summary, issue) => {
    summary[issue.severity] += 1
    return summary
  }, emptySummary())

export const verdictFor = (summary: Readonly<Record<IssueSeverity, number>>): Verdict => {
  if (summary.critical > 0) {
    return 'blocked'
  }
  return summary.error + summary.warning + summary.info > 0 ? 'lossy' : 'faithful'
}
