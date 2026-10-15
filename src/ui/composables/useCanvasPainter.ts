import { watchEffect, type ShallowRef } from 'vue'
import type { RenderResult } from '@/engine'

export const useCanvasPainter = (
  canvas: Readonly<ShallowRef<HTMLCanvasElement | null>>,
  result: () => RenderResult | undefined,
): void => {
  watchEffect(() => {
    const target = canvas.value
    const current = result()
    if (!target || !current) {
      return
    }
    target.width = current.width
    target.height = current.height
    const context = target.getContext('2d')
    if (!context) {
      return
    }
    const image = context.createImageData(current.width, current.height)
    image.data.set(current.pixels)
    context.putImageData(image, 0, 0)
  })
}
