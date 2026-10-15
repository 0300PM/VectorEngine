import { parseColor, transparent, type Rgba } from '@/core/color'
import {
  pixelsPerUnit,
  type PaintStyle,
  type VectorDocument,
  type VectorNode,
} from '@/core/document'
import {
  ellipsePath,
  multiply,
  rectanglePath,
  scaling,
  type Matrix2D,
  type PathCommand,
} from '@/core/geometry'
import type {
  RenderItem,
  RenderScene,
  RenderStroke,
  SceneBuildResult,
  UnsupportedFeature,
} from './types'

export type SceneBuildOptions = { readonly dpi?: number }

type Frame = { readonly transform: Matrix2D; readonly opacity: number }

type Collector = {
  readonly items: RenderItem[]
  readonly unsupported: UnsupportedFeature[]
}

const resolveFill = (style: PaintStyle): Rgba | undefined =>
  style.fill ? parseColor(style.fill.color) : undefined

const resolveStroke = (style: PaintStyle): RenderStroke | undefined => {
  if (!style.stroke || style.stroke.width <= 0) {
    return undefined
  }
  const color = parseColor(style.stroke.color)
  return color ? { color, width: style.stroke.width } : undefined
}

const pushItem = (
  collector: Collector,
  nodeId: string,
  commands: readonly PathCommand[],
  style: PaintStyle,
  frame: Frame,
): void => {
  const fill = resolveFill(style)
  const stroke = resolveStroke(style)
  if (!fill && !stroke) {
    return
  }
  collector.items.push({
    nodeId,
    commands,
    transform: frame.transform,
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    opacity: frame.opacity,
  })
}

const collectNode = (collector: Collector, node: VectorNode, parent: Frame): void => {
  const frame: Frame = {
    transform: multiply(parent.transform, node.transform),
    opacity: parent.opacity * node.opacity,
  }
  if (frame.opacity <= 0) {
    return
  }

  switch (node.type) {
    case 'group':
      node.children.forEach((child) => collectNode(collector, child, frame))
      return
    case 'rectangle':
      pushItem(
        collector,
        node.id,
        rectanglePath(node.x, node.y, node.width, node.height, node.cornerRadius),
        node.style,
        frame,
      )
      return
    case 'ellipse':
      pushItem(
        collector,
        node.id,
        ellipsePath(node.cx, node.cy, node.rx, node.ry),
        node.style,
        frame,
      )
      return
    case 'path':
      if (node.geometry.fillRule === 'evenodd') {
        collector.unsupported.push({ nodeId: node.id, feature: 'evenodd' })
      }
      pushItem(collector, node.id, node.geometry.commands, node.style, frame)
      return
    case 'text':
      collector.unsupported.push({ nodeId: node.id, feature: 'text' })
      return
    case 'image':
      collector.unsupported.push({ nodeId: node.id, feature: 'image' })
      return
  }
}

const toPixelSize = (value: number, scale: number): number => Math.max(1, Math.round(value * scale))

export const buildRenderScene = (
  document: VectorDocument,
  options: SceneBuildOptions = {},
): SceneBuildResult => {
  const scale = pixelsPerUnit(document.unit, options.dpi ?? document.exportSettings.dpi)
  const collector: Collector = { items: [], unsupported: [] }
  const root = scaling(scale)

  for (const layer of document.layers) {
    if (!layer.visible || layer.opacity <= 0) {
      continue
    }
    const frame: Frame = { transform: root, opacity: layer.opacity }
    layer.children.forEach((node) => collectNode(collector, node, frame))
  }

  const scene: RenderScene = {
    width: toPixelSize(document.width, scale),
    height: toPixelSize(document.height, scale),
    background: (document.background ? parseColor(document.background) : undefined) ?? transparent,
    items: collector.items,
  }

  return { scene, unsupported: collector.unsupported }
}
