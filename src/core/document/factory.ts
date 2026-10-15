import { identityMatrix, type FillRule, type Matrix2D, type PathCommand } from '@/core/geometry'
import { createId } from './identifiers'
import { CURRENT_SCHEMA_VERSION } from './migrations'
import type {
  AssetReference,
  Color,
  DocumentMetadata,
  EllipseNode,
  ExportSettings,
  FontDescription,
  GroupNode,
  Layer,
  PaintStyle,
  PathNode,
  RectangleNode,
  TextNode,
  VectorDocument,
  VectorNode,
} from './types'
import type { ColorSpace, DocumentUnit } from './units'

export type NodeOptions = {
  readonly id?: string
  readonly name?: string
  readonly opacity?: number
  readonly transform?: Matrix2D
}

export type StyledNodeOptions = NodeOptions & { readonly style?: PaintStyle }

export type LayerOptions = {
  readonly id?: string
  readonly name?: string
  readonly visible?: boolean
  readonly locked?: boolean
  readonly opacity?: number
}

export type DocumentOptions = {
  readonly id?: string
  readonly name?: string
  readonly width: number
  readonly height: number
  readonly unit?: DocumentUnit
  readonly colorSpace?: ColorSpace
  readonly background?: Color | null
  readonly layers?: readonly Layer[]
  readonly assets?: readonly AssetReference[]
  readonly metadata?: DocumentMetadata
  readonly exportSettings?: ExportSettings
}

export const DOCUMENT_GENERATOR = 'vector-engine'

const nodeBase = (prefix: string, options: NodeOptions) => ({
  id: options.id ?? createId(prefix),
  ...(options.name === undefined ? {} : { name: options.name }),
  opacity: options.opacity ?? 1,
  transform: options.transform ?? identityMatrix,
})

export const createRectangle = (
  bounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  },
  options: StyledNodeOptions & { readonly cornerRadius?: number } = {},
): RectangleNode => ({
  ...nodeBase('rect', options),
  type: 'rectangle',
  ...bounds,
  cornerRadius: options.cornerRadius ?? 0,
  style: options.style ?? {},
})

export const createEllipse = (
  shape: { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number },
  options: StyledNodeOptions = {},
): EllipseNode => ({
  ...nodeBase('ellipse', options),
  type: 'ellipse',
  ...shape,
  style: options.style ?? {},
})

export const createPath = (
  commands: readonly PathCommand[],
  options: StyledNodeOptions & { readonly fillRule?: FillRule } = {},
): PathNode => ({
  ...nodeBase('path', options),
  type: 'path',
  geometry: { commands, fillRule: options.fillRule ?? 'nonzero' },
  style: options.style ?? {},
})

export const createText = (
  text: {
    readonly x: number
    readonly y: number
    readonly content: string
    readonly font: FontDescription
  },
  options: StyledNodeOptions = {},
): TextNode => ({
  ...nodeBase('text', options),
  type: 'text',
  ...text,
  style: options.style ?? {},
})

export const createGroup = (
  children: readonly VectorNode[],
  options: NodeOptions = {},
): GroupNode => ({
  ...nodeBase('group', options),
  type: 'group',
  children,
})

export const createLayer = (
  children: readonly VectorNode[],
  options: LayerOptions = {},
): Layer => ({
  id: options.id ?? createId('layer'),
  name: options.name ?? 'Layer',
  visible: options.visible ?? true,
  locked: options.locked ?? false,
  opacity: options.opacity ?? 1,
  children,
})

export const createDocument = (options: DocumentOptions): VectorDocument => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: options.id ?? createId('doc'),
  name: options.name ?? 'Untitled',
  width: options.width,
  height: options.height,
  unit: options.unit ?? 'px',
  colorSpace: options.colorSpace ?? 'sRGB',
  background: options.background ?? null,
  layers: options.layers ?? [],
  assets: options.assets ?? [],
  metadata: options.metadata ?? {
    createdAt: new Date().toISOString(),
    generator: DOCUMENT_GENERATOR,
  },
  exportSettings: options.exportSettings ?? { dpi: 96 },
})
