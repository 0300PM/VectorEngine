import { multiply, scaling } from '@/core/geometry'
import type { RenderScene } from './types'

export type PixelSize = { readonly width: number; readonly height: number }

export const scaleRenderScene = (scene: RenderScene, target: PixelSize): RenderScene => {
  if (target.width === scene.width && target.height === scene.height) {
    return scene
  }
  const factor = scaling(target.width / scene.width, target.height / scene.height)
  return {
    ...scene,
    width: target.width,
    height: target.height,
    items: scene.items.map((item) => ({ ...item, transform: multiply(factor, item.transform) })),
  }
}

export const scaleSizeBy = (scene: PixelSize, factor: number): PixelSize => ({
  width: Math.max(1, Math.round(scene.width * factor)),
  height: Math.max(1, Math.round(scene.height * factor)),
})
