import { computeSceneContentBounds, extractScopedScene, resolveExportViewport } from '@/export/bounds'
import { resolveAlphaInfo } from '@/export/sizeEstimator'
import type {
  BackendExportOptions,
  BackendExportResult,
  EngineBackend,
  ExportRegion,
  ExportTarget,
  RenderOptions,
  RenderResult,
  ValidationIssue,
  ValidationResult,
} from '@/types/engine'
import { encodeBmp24, encodeBmp32 } from './bmpEncoder'
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

const ensureOutputSize = (width: number, height: number, maxMemoryBytes?: number, isRaster = true): void => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new VectorEngineError('output.dimensions', 'Output dimensions must be positive integers')
  }
  if (width > engineLimits.outputDimension || height > engineLimits.outputDimension) {
    throw new VectorEngineError('output.dimensions', `Output dimensions cannot exceed ${engineLimits.outputDimension.toLocaleString()} px`)
  }
  const pixels = width * height
  if (!Number.isSafeInteger(pixels) || pixels > engineLimits.outputPixels) {
    throw new VectorEngineError('output.pixels', `Output cannot exceed ${engineLimits.outputPixels.toLocaleString()} pixels`)
  }
  if (isRaster) {
    const budget = maxMemoryBytes ?? engineLimits.hardMemoryBudgetBytes
    if (pixels * 8 > budget) {
      throw new VectorEngineError('limit.memory', 'Requested export exceeds the configured memory limit')
    }
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

  async measureBounds(source: string, target: ExportTarget, includeHidden = false): Promise<ExportRegion | null> {
    const validation = this.validationFor(source)
    if (!validation.valid || !validation.scene) {
      throw new VectorEngineError('validation.failed', 'Scene validation failed', validation.issues)
    }
    const scoped = extractScopedScene(validation.scene, target, includeHidden)
    return computeSceneContentBounds(scoped, true)
  }

  async renderSvg(source: string, options: RenderOptions = {}): Promise<RenderResult> {
    const validation = this.validationFor(source)
    if (!validation.valid || !validation.scene) {
      throw new VectorEngineError('validation.failed', 'Scene validation failed', validation.issues)
    }

    const scoped = extractScopedScene(validation.scene, options.target ?? { type: 'scene' }, Boolean(options.includeHidden))
    const viewport = resolveExportViewport(validation.scene, scoped, options)
    ensureOutputSize(viewport.outputWidth, viewport.outputHeight, undefined, false)

    return {
      svg: renderSceneToSvg(validation.scene, {
        ...options,
        width: viewport.outputWidth,
        height: viewport.outputHeight,
      }),
      width: viewport.outputWidth,
      height: viewport.outputHeight,
      bounds: viewport.sourceBox,
      issues: validation.issues,
    }
  }

  async export(source: string, options: BackendExportOptions): Promise<BackendExportResult> {
    const validation = this.validationFor(source)
    if (!validation.valid || !validation.scene) {
      throw new VectorEngineError('validation.failed', 'Scene validation failed', validation.issues)
    }

    const scoped = extractScopedScene(validation.scene, options.target ?? { type: 'scene' }, Boolean(options.includeHidden))
    const viewport = resolveExportViewport(validation.scene, scoped, options)
    const width = viewport.outputWidth
    const height = viewport.outputHeight
    ensureOutputSize(width, height, options.maxMemoryBytes, options.format !== 'svg')

    const normalizedBg = options.background === null || options.background === 'transparent'
      ? 'transparent'
      : options.background === 'document' || options.background === undefined
        ? 'document'
        : typeof options.background === 'object'
          ? options.background
          : { color: options.background }

    const alphaInfo = resolveAlphaInfo(validation.scene, options.format, normalizedBg, options.bmpBitDepth ?? 24)
    const issues: ValidationIssue[] = [
      ...validation.issues,
      ...alphaInfo.warnings.map((message) => ({
        code: `format.${options.format}.alpha`,
        message,
        path: '/output/background',
        severity: 'warning' as const,
      })),
    ]

    if (options.qualityExplicit && options.format !== 'jpeg') {
      issues.push({
        code: 'options.ignoredQuality',
        message: 'Quality setting only applies to JPEG output and was ignored',
        path: '/output/quality',
        severity: 'warning',
      })
    }
    if (options.minifyExplicit && options.minifySvg && options.format !== 'svg') {
      issues.push({
        code: 'options.ignoredMinify',
        message: 'SVG minification setting only applies to SVG output and was ignored',
        path: '/output/minifySvg',
        severity: 'warning',
      })
    }

    const renderBackground = options.format === 'jpeg' && alphaInfo.requestedAlpha
      ? '#FFFFFF'
      : options.background
    const rendered = await this.renderSvg(source, {
      ...options,
      width,
      height,
      background: renderBackground,
    })

    if (options.format === 'svg') {
      return {
        data: new TextEncoder().encode(rendered.svg),
        mimeType: mimeByFormat.svg,
        extension: extensionByFormat.svg,
        width,
        height,
        hasAlpha: alphaInfo.outputHasAlpha,
        bounds: viewport.sourceBox,
        issues,
      }
    }

    const canvas = await rasterizeSvg(rendered.svg, width, height)
    let data: Uint8Array

    if (options.format === 'bmp') {
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        throw new VectorEngineError('raster.context', 'A 2D canvas context is not available')
      }
      const pixels = context.getImageData(0, 0, width, height).data
      if (options.bmpBitDepth === 32) {
        data = encodeBmp32(pixels, width, height)
      } else {
        const bgHex = typeof normalizedBg === 'object' ? normalizedBg.color : '#FFFFFF'
        data = encodeBmp24(pixels, width, height, bgHex)
      }
    } else if (options.format === 'png') {
      data = await canvasToBytes(canvas, 'image/png')
    } else {
      data = await canvasToBytes(canvas, 'image/jpeg', Math.min(100, Math.max(1, options.quality)) / 100)
    }

    return {
      data,
      mimeType: mimeByFormat[options.format],
      extension: extensionByFormat[options.format],
      width,
      height,
      hasAlpha: alphaInfo.outputHasAlpha,
      bounds: viewport.sourceBox,
      issues,
    }
  }
}
