import { parseColor } from '@/core/color'
import type { Layer, VectorDocument, VectorNode } from '@/core/document'
import type { DocumentFeature } from './features'

export type FeatureUsage = {
  readonly feature: DocumentFeature
  readonly subjects: readonly string[]
  readonly detail?: string
}

export type DocumentRequirements = ReadonlyMap<DocumentFeature, FeatureUsage>

class RequirementCollector {
  readonly #usages = new Map<DocumentFeature, { subjects: string[]; detail?: string }>()

  use(feature: DocumentFeature, subject?: string, detail?: string): void {
    const entry = this.#usages.get(feature) ?? { subjects: [] }
    if (subject !== undefined && !entry.subjects.includes(subject)) {
      entry.subjects.push(subject)
    }
    if (detail !== undefined) {
      entry.detail = detail
    }
    this.#usages.set(feature, entry)
  }

  finish(): DocumentRequirements {
    return new Map(
      [...this.#usages.entries()].map(([feature, entry]) => [
        feature,
        { feature, subjects: entry.subjects, ...(entry.detail ? { detail: entry.detail } : {}) },
      ]),
    )
  }
}

const hasAlpha = (color: string): boolean => (parseColor(color)?.a ?? 1) < 1

const countLeaves = (nodes: readonly VectorNode[]): number =>
  nodes.reduce((total, node) => total + (node.type === 'group' ? countLeaves(node.children) : 1), 0)

const collectStyle = (
  collector: RequirementCollector,
  node: Extract<VectorNode, { style: unknown }>,
): void => {
  if (node.style.fill) {
    collector.use('fill', node.id)
    if (hasAlpha(node.style.fill.color)) {
      collector.use('colorAlpha', node.id)
    }
  }
  if (node.style.stroke && node.style.stroke.width > 0) {
    collector.use('stroke', node.id)
    if (hasAlpha(node.style.stroke.color)) {
      collector.use('colorAlpha', node.id)
    }
  }
}

const collectNode = (collector: RequirementCollector, node: VectorNode): void => {
  collector.use(node.type, node.id)
  if (node.opacity < 1) {
    const leaves = node.type === 'group' ? countLeaves(node.children) : 1
    collector.use(leaves > 1 ? 'groupOpacity' : 'nodeOpacity', node.id)
  }
  switch (node.type) {
    case 'rectangle':
      if (node.cornerRadius > 0) {
        collector.use('cornerRadius', node.id)
      }
      collectStyle(collector, node)
      return
    case 'ellipse':
    case 'text':
      collectStyle(collector, node)
      return
    case 'path':
      if (node.geometry.fillRule === 'evenodd') {
        collector.use('evenodd', node.id)
      }
      collectStyle(collector, node)
      return
    case 'image':
      return
    case 'group':
      node.children.forEach((child) => collectNode(collector, child))
  }
}

const collectLayer = (collector: RequirementCollector, layer: Layer): void => {
  collector.use('layers', layer.id)
  if (!layer.visible) {
    collector.use('hiddenLayers', layer.id)
  }
  if (layer.locked) {
    collector.use('lockedLayers', layer.id)
  }
  if (layer.opacity < 1) {
    collector.use(countLeaves(layer.children) > 1 ? 'groupOpacity' : 'nodeOpacity', layer.id)
  }
  layer.children.forEach((node) => collectNode(collector, node))
}

export const collectRequirements = (document: VectorDocument): DocumentRequirements => {
  const collector = new RequirementCollector()
  document.layers.forEach((layer) => collectLayer(collector, layer))

  if (document.background === null || hasAlpha(document.background)) {
    collector.use('transparentBackground')
  }
  if (document.unit !== 'px') {
    collector.use('physicalUnits', undefined, document.unit)
  }
  if (document.colorSpace === 'Display-P3') {
    collector.use('displayP3', undefined, document.colorSpace)
  }
  if (document.assets.length > 0) {
    document.assets.forEach((asset) => collector.use('assets', asset.id))
  }
  if (Object.values(document.metadata).some((value) => value !== undefined)) {
    collector.use('metadata')
  }
  return collector.finish()
}
