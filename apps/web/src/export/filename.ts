import type { BatchCollisionRecord, ExportFormat, ExportTarget } from './types'

const windowsReservedNames = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])

export const extensionForFormat = (format: ExportFormat): string => (
  format === 'jpeg' ? 'jpg' : format
)

export const mimeTypeForFormat = (format: ExportFormat): string => {
  switch (format) {
    case 'svg': return 'image/svg+xml'
    case 'png': return 'image/png'
    case 'jpeg': return 'image/jpeg'
    case 'bmp': return 'image/bmp'
  }
}

export const sanitizeSegment = (raw: string, fallback = 'item'): string => {
  let cleaned = ''
  for (const ch of raw.trim().toLowerCase()) {
    const code = ch.charCodeAt(0)
    if (code <= 31 || ch === '/' || ch === '\\' || ch === ':' || ch === '*' || ch === '?' || ch === '"' || ch === '<' || ch === '>' || ch === '|') {
      cleaned += '-'
    } else {
      cleaned += ch
    }
  }
  const normalized = cleaned
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalized) {
    return fallback
  }
  if (windowsReservedNames.has(normalized)) {
    return `${normalized}-file`
  }
  return normalized
}

export const describeTargetName = (target: ExportTarget): string => {
  switch (target.type) {
    case 'scene':
      return 'scene'
    case 'group':
    case 'object':
      return target.objectId || target.type
    case 'layer':
      return target.layerId || 'layer'
    case 'workspace':
      return target.workspaceId || 'workspace'
    case 'selection':
    case 'objects':
      return target.objectIds.length === 1 ? target.objectIds[0]! : `${target.type}-${target.objectIds.length}`
  }
}

export interface FilenameTemplateContext {
  document: string
  target: ExportTarget
  objectLabel?: string
  layerLabel?: string
  scale?: number
  scaleMode?: 'preset' | 'custom'
  width: number
  height: number
  format: ExportFormat
  index?: number
}

export const formatExportFilename = (
  template: string,
  context: FilenameTemplateContext,
): string => {
  const activeTemplate = template.trim() || '{document}'
  const objectToken = sanitizeSegment(context.objectLabel ?? describeTargetName(context.target), 'object')
  const docToken = sanitizeSegment(context.document, 'vector-scene')
  const targetToken = sanitizeSegment(context.target.type, 'scene')
  const layerToken = sanitizeSegment(
    context.layerLabel ?? (context.target.type === 'layer' ? context.target.layerId : 'default'),
    'layer',
  )
  const scaleToken = context.scaleMode === 'custom'
    ? 'custom'
    : `${context.scale ?? 1}x`
  const indexToken = String((context.index ?? 0) + 1).padStart(2, '0')
  const extension = extensionForFormat(context.format)

  const expanded = activeTemplate
    .replaceAll('{document}', docToken)
    .replaceAll('{object}', objectToken)
    .replaceAll('{name}', objectToken)
    .replaceAll('{id}', objectToken)
    .replaceAll('{target}', targetToken)
    .replaceAll('{scope}', targetToken)
    .replaceAll('{layer}', layerToken)
    .replaceAll('{scale}', sanitizeSegment(scaleToken, '1x'))
    .replaceAll('{width}', String(context.width))
    .replaceAll('{height}', String(context.height))
    .replaceAll('{format}', context.format)
    .replaceAll('{index}', indexToken)

  const stem = sanitizeSegment(expanded.replace(/\.(svg|png|jpe?g|bmp)$/i, ''), docToken)
  return `${stem}.${extension}`
}

export class FilenameCollisionResolver {
  private readonly usedLower = new Set<string>()
  readonly collisions: BatchCollisionRecord[] = []

  claim(itemId: string, candidateFilename: string): string {
    const dotIndex = candidateFilename.lastIndexOf('.')
    const stem = dotIndex > 0 ? candidateFilename.slice(0, dotIndex) : candidateFilename
    const extension = dotIndex > 0 ? candidateFilename.slice(dotIndex) : ''

    const lower = candidateFilename.toLowerCase()
    if (!this.usedLower.has(lower)) {
      this.usedLower.add(lower)
      return candidateFilename
    }

    let suffix = 2
    while (suffix < 100_000) {
      const nextName = `${stem}-${suffix}${extension}`
      if (!this.usedLower.has(nextName.toLowerCase())) {
        this.usedLower.add(nextName.toLowerCase())
        this.collisions.push({
          itemId,
          originalFilename: candidateFilename,
          resolvedFilename: nextName,
        })
        return nextName
      }
      suffix += 1
    }

    const fallback = `${stem}-${Date.now()}${extension}`
    this.usedLower.add(fallback.toLowerCase())
    return fallback
  }
}
