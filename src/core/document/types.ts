import type { Matrix2D, PathGeometry } from '@/core/geometry'
import type { ColorSpace, DocumentUnit } from './units'

export type Color = string

export type Fill = { readonly color: Color }

export type Stroke = { readonly color: Color; readonly width: number }

export type PaintStyle = { readonly fill?: Fill; readonly stroke?: Stroke }

export type FontStyle = 'normal' | 'italic'

export type FontDescription = {
  readonly family: string
  readonly size: number
  readonly weight: number
  readonly style: FontStyle
}

export type NodeBase = {
  readonly id: string
  readonly name?: string
  readonly opacity: number
  readonly transform: Matrix2D
}

export type RectangleNode = NodeBase & {
  readonly type: 'rectangle'
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly cornerRadius: number
  readonly style: PaintStyle
}

export type EllipseNode = NodeBase & {
  readonly type: 'ellipse'
  readonly cx: number
  readonly cy: number
  readonly rx: number
  readonly ry: number
  readonly style: PaintStyle
}

export type PathNode = NodeBase & {
  readonly type: 'path'
  readonly geometry: PathGeometry
  readonly style: PaintStyle
}

export type TextNode = NodeBase & {
  readonly type: 'text'
  readonly x: number
  readonly y: number
  readonly content: string
  readonly font: FontDescription
  readonly style: PaintStyle
}

export type ImageNode = NodeBase & {
  readonly type: 'image'
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly assetId: string
}

export type GroupNode = NodeBase & {
  readonly type: 'group'
  readonly children: readonly VectorNode[]
}

export type VectorNode = RectangleNode | EllipseNode | PathNode | TextNode | ImageNode | GroupNode

export type NodeType = VectorNode['type']

export type Layer = {
  readonly id: string
  readonly name: string
  readonly visible: boolean
  readonly locked: boolean
  readonly opacity: number
  readonly children: readonly VectorNode[]
}

export type AssetKind = 'image' | 'font' | 'color-profile'

export type AssetReference = {
  readonly id: string
  readonly kind: AssetKind
  readonly path: string
  readonly mimeType: string
  readonly name?: string
}

export type DocumentMetadata = {
  readonly createdAt?: string
  readonly modifiedAt?: string
  readonly generator?: string
}

export type ExportSettings = { readonly dpi: number }

export type VectorDocument = {
  readonly schemaVersion: 1
  readonly id: string
  readonly name: string
  readonly width: number
  readonly height: number
  readonly unit: DocumentUnit
  readonly colorSpace: ColorSpace
  readonly background: Color | null
  readonly layers: readonly Layer[]
  readonly assets: readonly AssetReference[]
  readonly metadata: DocumentMetadata
  readonly exportSettings: ExportSettings
}
