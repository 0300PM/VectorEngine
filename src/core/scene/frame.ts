import type { Rgba } from '@/core/color'
import {
  inflateBounds,
  multiply,
  pathBounds,
  scaling,
  strokeInflation,
  translation,
  unionBounds,
  type Bounds,
  type Matrix2D,
} from '@/core/geometry'
import type { PixelSize } from './scale'
import type { RenderItem, RenderScene } from './types'

export const itemBounds = (item: RenderItem): Bounds | undefined => {
  const bounds = pathBounds(item.commands, item.transform)
  if (!bounds || !item.stroke) {
    return bounds
  }
  return inflateBounds(bounds, strokeInflation(item.stroke.width, item.transform))
}

export const sceneBounds = (scene: RenderScene): Bounds | undefined =>
  unionBounds(scene.items.map(itemBounds))

export const withSceneBackground = (scene: RenderScene, background: Rgba): RenderScene => ({
  ...scene,
  background,
})

const transformItems = (scene: RenderScene, matrix: Matrix2D): RenderItem[] =>
  scene.items.map((item) => ({ ...item, transform: multiply(matrix, item.transform) }))

export const fitRenderScene = (scene: RenderScene, target: PixelSize, padding = 0): RenderScene => {
  const inset = Math.min(padding, Math.min(target.width, target.height) / 2 - 0.5)
  const availableWidth = Math.max(1, target.width - inset * 2)
  const availableHeight = Math.max(1, target.height - inset * 2)
  const factor = Math.min(availableWidth / scene.width, availableHeight / scene.height)
  const offsetX = (target.width - scene.width * factor) / 2
  const offsetY = (target.height - scene.height * factor) / 2
  const matrix = multiply(translation(offsetX, offsetY), scaling(factor))
  return {
    ...scene,
    width: target.width,
    height: target.height,
    items: transformItems(scene, matrix),
  }
}

export const cropRenderScene = (
  scene: RenderScene,
  nodeIds: ReadonlySet<string>,
  padding = 0,
): RenderScene | undefined => {
  const items = scene.items.filter((item) => nodeIds.has(item.nodeId))
  const bounds = unionBounds(items.map(itemBounds))
  if (!bounds) {
    return undefined
  }
  const padded = inflateBounds(bounds, Math.max(0, padding))
  const offset = translation(-padded.minX, -padded.minY)
  return {
    width: Math.max(1, Math.ceil(padded.maxX - padded.minX)),
    height: Math.max(1, Math.ceil(padded.maxY - padded.minY)),
    background: scene.background,
    items: items.map((item) => ({ ...item, transform: multiply(offset, item.transform) })),
  }
}
