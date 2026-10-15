import { formatCssColor } from '@/core/color'
import type { PathCommand } from '@/core/geometry'
import type { RenderItem, RenderScene } from '@/core/scene'
import { RenderFailedError, type RenderResult, type VectorEngine } from '../types'
import { createBrowserSurface, type Canvas2DContext, type SurfaceFactory } from './surface'

const tracePath = (context: Canvas2DContext, commands: readonly PathCommand[]): void => {
  context.beginPath()
  for (const command of commands) {
    switch (command.type) {
      case 'M':
        context.moveTo(command.x, command.y)
        break
      case 'L':
        context.lineTo(command.x, command.y)
        break
      case 'Q':
        context.quadraticCurveTo(command.x1, command.y1, command.x, command.y)
        break
      case 'C':
        context.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y)
        break
      case 'Z':
        context.closePath()
        break
    }
  }
}

const paintItem = (context: Canvas2DContext, item: RenderItem): void => {
  const { a, b, c, d, e, f } = item.transform
  context.save()
  context.setTransform(a, b, c, d, e, f)
  context.globalAlpha = item.opacity
  tracePath(context, item.commands)
  if (item.fill) {
    context.fillStyle = formatCssColor(item.fill)
    context.fill('nonzero')
  }
  if (item.stroke) {
    context.strokeStyle = formatCssColor(item.stroke.color)
    context.lineWidth = item.stroke.width
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.stroke()
  }
  context.restore()
}

export class Canvas2DEngine implements VectorEngine {
  readonly kind = 'canvas2d'

  readonly #createSurface: SurfaceFactory

  constructor(createSurface: SurfaceFactory = createBrowserSurface) {
    this.#createSurface = createSurface
  }

  render(scene: RenderScene): Promise<RenderResult> {
    const surface = this.#createSurface(scene.width, scene.height)
    const context = surface.getContext('2d')
    if (!context) {
      return Promise.reject(
        new RenderFailedError(this.kind, 1, 'Canvas 2D context is not available'),
      )
    }

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, scene.width, scene.height)
    if (scene.background.a > 0) {
      context.fillStyle = formatCssColor(scene.background)
      context.fillRect(0, 0, scene.width, scene.height)
    }
    scene.items.forEach((item) => paintItem(context, item))

    const pixels = context.getImageData(0, 0, scene.width, scene.height).data
    return Promise.resolve({
      width: scene.width,
      height: scene.height,
      pixels: Uint8ClampedArray.from(pixels),
      engine: this.kind,
    })
  }

  dispose(): void {}
}
