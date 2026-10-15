import type { Rgba } from '@/core/color'
import type { Matrix2D, PathCommand } from '@/core/geometry'

export type RenderStroke = { readonly color: Rgba; readonly width: number }

export type RenderItem = {
  readonly nodeId: string
  readonly commands: readonly PathCommand[]
  readonly transform: Matrix2D
  readonly fill?: Rgba
  readonly stroke?: RenderStroke
  readonly opacity: number
}

export type RenderScene = {
  readonly width: number
  readonly height: number
  readonly background: Rgba
  readonly items: readonly RenderItem[]
}

export const unsupportedFeatureKinds = ['text', 'image', 'evenodd'] as const
export type UnsupportedFeatureKind = (typeof unsupportedFeatureKinds)[number]

export type UnsupportedFeature = {
  readonly nodeId: string
  readonly feature: UnsupportedFeatureKind
}

export type SceneBuildResult = {
  readonly scene: RenderScene
  readonly unsupported: readonly UnsupportedFeature[]
}
