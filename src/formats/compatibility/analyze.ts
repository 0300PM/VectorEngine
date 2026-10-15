import type { VectorDocument } from '@/core/document'
import {
  isContentFeature,
  type CapabilityTarget,
  type DocumentFeature,
  type FeatureSupport,
} from './features'
import {
  summarize,
  verdictFor,
  type CompatibilityIssue,
  type CompatibilityReport,
  type IssueSeverity,
  type Remedy,
} from './report'
import { collectRequirements, type FeatureUsage } from './requirements'

type SeverityTable = Readonly<Record<Exclude<FeatureSupport, 'native'>, IssueSeverity>>

const contentSeverity: SeverityTable = {
  converted: 'warning',
  rasterized: 'info',
  dropped: 'error',
  unsupported: 'error',
}

const styleSeverity: SeverityTable = {
  converted: 'warning',
  rasterized: 'info',
  dropped: 'warning',
  unsupported: 'warning',
}

const structureSeverity: SeverityTable = {
  converted: 'info',
  rasterized: 'info',
  dropped: 'info',
  unsupported: 'warning',
}

const severityOverrides: Partial<Record<DocumentFeature, Partial<SeverityTable>>> = {
  physicalUnits: { converted: 'info' },
  assets: { dropped: 'warning', unsupported: 'warning' },
  hiddenLayers: { dropped: 'info' },
  cornerRadius: { converted: 'info' },
}

const remedyTable: Partial<Record<DocumentFeature, Partial<Record<FeatureSupport, Remedy[]>>>> = {
  text: {
    converted: ['substitute_font'],
    dropped: ['skip_objects', 'choose_other_format', 'cancel'],
    unsupported: ['skip_objects', 'choose_other_format', 'cancel'],
  },
  image: {
    dropped: ['skip_objects', 'choose_other_format', 'cancel'],
    unsupported: ['skip_objects', 'choose_other_format', 'cancel'],
  },
  evenodd: { converted: ['choose_other_format'] },
  colorAlpha: { dropped: ['flatten_alpha', 'choose_other_format'] },
  transparentBackground: { dropped: ['flatten_alpha', 'choose_other_format'] },
  physicalUnits: { converted: ['convert_units'] },
  displayP3: { converted: ['convert_colors'] },
  groupOpacity: { converted: ['rasterize', 'choose_other_format'] },
  assets: { dropped: ['choose_other_format'], unsupported: ['choose_other_format'] },
}

const severityFor = (
  feature: DocumentFeature,
  support: FeatureSupport,
): IssueSeverity | undefined => {
  if (support === 'native') {
    return undefined
  }
  const override = severityOverrides[feature]?.[support]
  if (override) {
    return override
  }
  if (isContentFeature(feature)) {
    return contentSeverity[support]
  }
  return (styleFeatureSet.has(feature) ? styleSeverity : structureSeverity)[support]
}

const styleFeatureSet: ReadonlySet<DocumentFeature> = new Set([
  'fill',
  'stroke',
  'evenodd',
  'cornerRadius',
  'nodeOpacity',
  'groupOpacity',
  'colorAlpha',
  'transparentBackground',
  'displayP3',
])

const isRasterTarget = (target: CapabilityTarget): boolean => target.medium === 'raster'

const toIssue = (
  usage: FeatureUsage,
  support: FeatureSupport,
  severity: IssueSeverity,
  rasterTarget: boolean,
): CompatibilityIssue => ({
  feature: usage.feature,
  support,
  severity,
  subjects: usage.subjects,
  count: Math.max(usage.subjects.length, 1),
  remedies: (remedyTable[usage.feature]?.[support] ?? []).filter(
    (remedy) => !(rasterTarget && remedy === 'rasterize'),
  ),
  ...(usage.detail ? { detail: usage.detail } : {}),
})

const outputWouldBeEmpty = (
  issues: readonly CompatibilityIssue[],
  requirements: ReadonlyMap<DocumentFeature, FeatureUsage>,
): boolean => {
  const leafFeatures: DocumentFeature[] = ['rectangle', 'ellipse', 'path', 'text', 'image']
  const used = leafFeatures.filter((feature) => requirements.has(feature))
  if (used.length === 0) {
    return false
  }
  const lost = new Set(
    issues
      .filter((issue) => issue.support === 'dropped' || issue.support === 'unsupported')
      .map((issue) => issue.feature),
  )
  return used.every((feature) => lost.has(feature))
}

export const analyzeCompatibility = (
  document: VectorDocument,
  target: CapabilityTarget,
): CompatibilityReport => {
  const requirements = collectRequirements(document)
  const issues: CompatibilityIssue[] = []
  const rasterTarget = isRasterTarget(target)

  for (const usage of requirements.values()) {
    const support = target.capabilities[usage.feature]
    const severity = severityFor(usage.feature, support)
    if (severity) {
      issues.push(toIssue(usage, support, severity, rasterTarget))
    }
  }

  if (outputWouldBeEmpty(issues, requirements)) {
    issues.unshift({
      feature: 'output',
      support: 'unsupported',
      severity: 'critical',
      subjects: [],
      count: 1,
      remedies: ['choose_other_format', 'cancel'],
    })
  }

  const order: Record<IssueSeverity, number> = { critical: 0, error: 1, warning: 2, info: 3 }
  issues.sort((left, right) => order[left.severity] - order[right.severity])
  const summary = summarize(issues)
  return {
    targetId: target.id,
    targetLabel: target.label,
    issues,
    summary,
    verdict: verdictFor(summary),
  }
}
