import { z } from 'zod'
import { isColor } from '@/core/color'
import { fillRules, identityMatrix } from '@/core/geometry'
import type { Layer, VectorDocument, VectorNode } from '../types'
import { colorSpaces, documentUnits } from '../units'
import type { DocumentIssueReason } from './issues'

export const SCHEMA_VERSION_1 = 1

const reason = (value: DocumentIssueReason) => ({ reason: value })

const finite = z.number()
const nonNegative = finite.min(0)
const positive = finite.positive()
const unitInterval = finite.min(0).max(1)
const identifier = z.string().min(1)

const matrixSchema = z.object({
  a: finite,
  b: finite,
  c: finite,
  d: finite,
  e: finite,
  f: finite,
})

const colorSchema = z
  .string()
  .trim()
  .refine(isColor, { message: 'Unsupported color format', params: reason('invalid_color') })

const fillSchema = z.object({ color: colorSchema })

const strokeSchema = z.object({ color: colorSchema, width: nonNegative })

const paintStyleSchema = z.object({
  fill: fillSchema.optional(),
  stroke: strokeSchema.optional(),
})

const pathCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('M'), x: finite, y: finite }),
  z.object({ type: z.literal('L'), x: finite, y: finite }),
  z.object({ type: z.literal('Q'), x1: finite, y1: finite, x: finite, y: finite }),
  z.object({
    type: z.literal('C'),
    x1: finite,
    y1: finite,
    x2: finite,
    y2: finite,
    x: finite,
    y: finite,
  }),
  z.object({ type: z.literal('Z') }),
])

const pathGeometrySchema = z.object({
  commands: z.array(pathCommandSchema),
  fillRule: z.enum(fillRules).default('nonzero'),
})

const fontSchema = z.object({
  family: z.string().min(1),
  size: positive,
  weight: z.number().int().min(100).max(900).default(400),
  style: z.enum(['normal', 'italic']).default('normal'),
})

const nodeBase = {
  id: identifier,
  name: z.string().optional(),
  opacity: unitInterval.default(1),
  transform: matrixSchema.default(identityMatrix),
}

const rectangleNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('rectangle'),
  x: finite,
  y: finite,
  width: nonNegative,
  height: nonNegative,
  cornerRadius: nonNegative.default(0),
  style: paintStyleSchema.default({}),
})

const ellipseNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('ellipse'),
  cx: finite,
  cy: finite,
  rx: nonNegative,
  ry: nonNegative,
  style: paintStyleSchema.default({}),
})

const pathNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('path'),
  geometry: pathGeometrySchema,
  style: paintStyleSchema.default({}),
})

const textNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('text'),
  x: finite,
  y: finite,
  content: z.string(),
  font: fontSchema,
  style: paintStyleSchema.default({}),
})

const imageNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('image'),
  x: finite,
  y: finite,
  width: nonNegative,
  height: nonNegative,
  assetId: identifier,
})

const groupNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('group'),
  children: z.array(z.lazy((): z.ZodType<VectorNode> => vectorNodeSchema)),
})

const vectorNodeSchema = z.discriminatedUnion('type', [
  rectangleNodeSchema,
  ellipseNodeSchema,
  pathNodeSchema,
  textNodeSchema,
  imageNodeSchema,
  groupNodeSchema,
]) satisfies z.ZodType<VectorNode>

const layerSchema = z.object({
  id: identifier,
  name: z.string().default('Layer'),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: unitInterval.default(1),
  children: z.array(vectorNodeSchema).default([]),
}) satisfies z.ZodType<Layer>

const assetReferenceSchema = z.object({
  id: identifier,
  kind: z.enum(['image', 'font', 'color-profile']),
  path: z.string().min(1),
  mimeType: z.string().min(1),
  name: z.string().optional(),
})

const metadataSchema = z.object({
  createdAt: z.iso.datetime().optional(),
  modifiedAt: z.iso.datetime().optional(),
  generator: z.string().optional(),
})

const exportSettingsSchema = z.object({
  dpi: positive.default(96),
})

type IdentifierOccurrence = { readonly id: string; readonly path: PropertyKey[] }

const collectNodeIds = (
  nodes: readonly VectorNode[],
  path: PropertyKey[],
  into: IdentifierOccurrence[],
): void => {
  nodes.forEach((node, index) => {
    const nodePath = [...path, index]
    into.push({ id: node.id, path: [...nodePath, 'id'] })
    if (node.type === 'group') {
      collectNodeIds(node.children, [...nodePath, 'children'], into)
    }
  })
}

const collectDocumentIds = (document: VectorDocument): IdentifierOccurrence[] => {
  const occurrences: IdentifierOccurrence[] = []
  document.layers.forEach((layer, index) => {
    occurrences.push({ id: layer.id, path: ['layers', index, 'id'] })
    collectNodeIds(layer.children, ['layers', index, 'children'], occurrences)
  })
  document.assets.forEach((asset, index) => {
    occurrences.push({ id: asset.id, path: ['assets', index, 'id'] })
  })
  return occurrences
}

export const vectorDocumentSchemaV1 = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION_1),
    id: identifier,
    name: z.string().default('Untitled'),
    width: positive,
    height: positive,
    unit: z.enum(documentUnits).default('px'),
    colorSpace: z.enum(colorSpaces).default('sRGB'),
    background: colorSchema.nullable().default(null),
    layers: z.array(layerSchema).default([]),
    assets: z.array(assetReferenceSchema).default([]),
    metadata: metadataSchema.default({}),
    exportSettings: exportSettingsSchema.prefault({}),
  })
  .check((context) => {
    const seen = new Set<string>()
    for (const occurrence of collectDocumentIds(context.value)) {
      if (seen.has(occurrence.id)) {
        context.issues.push({
          code: 'custom',
          input: occurrence.id,
          path: occurrence.path,
          message: `Duplicate identifier "${occurrence.id}"`,
          params: reason('duplicate_id'),
        })
      }
      seen.add(occurrence.id)
    }
  }) satisfies z.ZodType<VectorDocument>

export type VectorDocumentInputV1 = z.input<typeof vectorDocumentSchemaV1>
