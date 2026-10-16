import type {
  EngineBackend,
  ExportOptions,
  ExportResult,
  RenderOptions,
  RenderResult,
  ValidationResult,
} from '@/types/engine'
import { encodeBmp24 } from './bmpEncoder'
import { VectorEngineError } from './errors'
import { engineLimits } from './limits'
import { canvasToBytes, rasterizeSvg } from './rasterizer'
import { renderSceneToSvg } from './svgRenderer'
import { validateSceneSource } from './validator'

const mimeByFormat = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
} as const

const extensionByFormat = {
  svg: 'svg',
  png: 'png',
  jpeg: 'jpg',
  bmp: 'bmp',
} as const

const ensureOutputSize = (width: number, height: number): void => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new VectorEngineError('output.dimensions', 'Output dimensions must be positive integers')
  }
  if (width > engineLimits.outputDimension || height > engineLimits.outputDimension) {
    throw new VectorEngineError('output.dimensions', `Output dimensions cannot exceed ${engineLimits.outputDimension.toLocaleString()} px`)
  }
  if (!Number.isSafeInteger(width * height) || width * height > engineLimits.outputPixels) {
    throw new VectorEngineError('output.pixels', `Output cannot exceed ${engineLimits.outputPixels.toLocaleString()} pixels`)
  }
}

export class BrowserBackend implements EngineBackend {
  readonly name = 'Browser renderer'
  private cachedSource = ''
  private cachedValidation: ValidationResult | null = null

  private validationFor(source: string): ValidationResult {
    if (this.cachedValidation && this.cachedSource === source) {
      return this.cachedValidation
    }
    this.cachedSource = source
    this.cachedValidation = validateSceneSource(source)
    return this.cachedValidation
  }

  async validate(source: string): Promise<ValidationResult> {
    return this.validationFor(source)
  }

  async renderSvg(source: string, options: RenderOptions = {}): Promise<RenderResult> {
    const validation = this.validationFor(source)
    if (!validation.valid || !validation.scene) {
      throw new VectorEngineError('validation.failed', 'Scene validation failed', validation.issues)
    }

    const width = Math.round(options.width ?? validation.scene.document.width)
    const height = Math.round(options.height ?? validation.scene.document.height)
    ensureOutputSize(width, height)

    return {
      svg: renderSceneToSvg(validation.scene, { ...options, width, height }),
      width,
      height,
    }
  }

  async export(source: string, options: ExportOptions): Promise<ExportResult> {
    ensureOutputSize(options.width, options.height)
    const background = options.format === 'jpeg' && options.background === null ? '#FFFFFF' : options.background
    const rendered = await this.renderSvg(source, {
      width: options.width,
      height: options.height,
      background,
    })

    if (options.format === 'svg') {
      return {
        data: new TextEncoder().encode(rendered.svg),
        mimeType: mimeByFormat.svg,
        extension: extensionByFormat.svg,
      }
    }

    const canvas = await rasterizeSvg(rendered.svg, options.width, options.height)
    let data: Uint8Array

    if (options.format === 'bmp') {
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        throw new VectorEngineError('raster.context', 'A 2D canvas context is not available')
      }
      const pixels = context.getImageData(0, 0, options.width, options.height).data
      data = encodeBmp24(pixels, options.width, options.height, background ?? '#FFFFFF')
    } else if (options.format === 'png') {
      data = await canvasToBytes(canvas, 'image/png')
    } else {
      data = await canvasToBytes(canvas, 'image/jpeg', options.quality / 100)
    }

    return {
      data,
      mimeType: mimeByFormat[options.format],
      extension: extensionByFormat[options.format],
    }
  }
}
