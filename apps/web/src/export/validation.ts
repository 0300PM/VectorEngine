import { parseColor } from '@/engine/color'
import { engineLimits } from '@/engine/limits'
import type { VectorScene } from '@/types/scene'
import { collectSceneCatalog } from './bounds'
import type {
  ExportErrorInfo,
  ExportFormat,
  ExportOptions,
  ExportScalePreset,
} from './types'

const supportedFormats = new Set<ExportFormat>(['svg', 'png', 'jpeg', 'bmp'])
const supportedScales = new Set<ExportScalePreset>([0.5, 1, 2, 3, 4])

export interface ValidationOutcome {
  ok: boolean
  errors: ExportErrorInfo[]
  warnings: string[]
}

export const validateExportOptions = (
  options: ExportOptions,
  scene?: VectorScene | null,
): ValidationOutcome => {
  const errors: ExportErrorInfo[] = []
  const warnings: string[] = []

  if (!supportedFormats.has(options.format)) {
    errors.push({
      code: 'options.format',
      message: `Unsupported export format: ${String(options.format)}`,
      path: '/format',
    })
  }

  if (options.scale !== undefined && !supportedScales.has(options.scale)) {
    errors.push({
      code: 'options.scale',
      message: 'Export scale preset must be one of 0.5, 1, 2, 3, or 4',
      path: '/scale',
    })
  }

  if (options.width !== undefined) {
    if (!Number.isInteger(options.width) || options.width < 1 || options.width > engineLimits.outputDimension) {
      errors.push({
        code: 'options.width',
        message: `Width must be an integer between 1 and ${engineLimits.outputDimension.toLocaleString()} px`,
        path: '/width',
      })
    }
  }

  if (options.height !== undefined) {
    if (!Number.isInteger(options.height) || options.height < 1 || options.height > engineLimits.outputDimension) {
      errors.push({
        code: 'options.height',
        message: `Height must be an integer between 1 and ${engineLimits.outputDimension.toLocaleString()} px`,
        path: '/height',
      })
    }
  }

  if (options.width !== undefined && options.height !== undefined) {
    const pixels = options.width * options.height
    if (!Number.isSafeInteger(pixels) || pixels > engineLimits.outputPixels) {
      errors.push({
        code: 'options.pixels',
        message: `Output area exceeds the ${engineLimits.outputPixels.toLocaleString()} pixel limit`,
        path: '/dimensions',
      })
    } else if (options.format !== 'svg') {
      const budget = options.maxMemoryBytes ?? engineLimits.hardMemoryBudgetBytes
      if (pixels * 8 > budget) {
        errors.push({
          code: 'limit.memory',
          message: `Output dimensions exceed the ${(budget / (1024 * 1024)).toFixed(0)} MB memory limit`,
          path: '/dimensions',
        })
      }
    }
  }

  if (options.margin !== undefined) {
    if (!Number.isFinite(options.margin) || options.margin < 0 || options.margin > engineLimits.maxMargin) {
      errors.push({
        code: 'options.margin',
        message: `Margin must be between 0 and ${engineLimits.maxMargin.toLocaleString()} px`,
        path: '/margin',
      })
    }
  }

  if (options.quality !== undefined) {
    if (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) {
      errors.push({
        code: 'options.quality',
        message: 'JPEG quality must be between 1 and 100',
        path: '/quality',
      })
    } else if (options.format !== 'jpeg') {
      warnings.push(`Quality option (${options.quality}) only affects JPEG compression and was ignored for ${options.format.toUpperCase()}.`)
    }
  }

  if (options.minifySvg && options.format !== 'svg') {
    warnings.push(`SVG minification only affects SVG exports and was ignored for ${options.format.toUpperCase()}.`)
  }

  if (options.bmpBitDepth !== undefined && options.bmpBitDepth !== 24 && options.bmpBitDepth !== 32) {
    errors.push({
      code: 'options.bmpBitDepth',
      message: 'BMP bit depth must be 24 or 32',
      path: '/bmpBitDepth',
    })
  }

  if (typeof options.background === 'object' && options.background !== null) {
    if (!parseColor(options.background.color)) {
      errors.push({
        code: 'options.background',
        message: `Invalid hexadecimal background color: ${options.background.color}`,
        path: '/background/color',
      })
    }
  } else if (options.background !== 'document' && options.background !== 'transparent') {
    errors.push({
      code: 'options.background',
      message: 'Background must be "document", "transparent", or { color: "#RRGGBB" }',
      path: '/background',
    })
  }

  const target = options.target
  if (!target || typeof target !== 'object') {
    errors.push({
      code: 'options.target',
      message: 'Export target configuration is required',
      path: '/target',
    })
    return { ok: false, errors, warnings }
  }

  if (scene) {
    const catalog = collectSceneCatalog(scene)
    const objectById = new Map(catalog.objects.map((entry) => [entry.id, entry]))
    const layerIds = new Set(catalog.layers.map((layer) => layer.id))
    const workspaceIds = new Set(catalog.workspaces.map((ws) => ws.id))

    if (target.type === 'selection' || target.type === 'objects') {
      if (!Array.isArray(target.objectIds) || target.objectIds.length === 0) {
        errors.push({
          code: 'target.emptySelection',
          message: 'Select at least one object to export',
          path: '/target/objectIds',
        })
      } else {
        for (const id of target.objectIds) {
          if (!objectById.has(id)) {
            errors.push({
              code: 'target.notFound',
              message: `Selected object "${id}" does not exist in scene`,
              path: '/target/objectIds',
            })
          }
        }
      }
    } else if (target.type === 'group') {
      const found = objectById.get(target.objectId)
      if (!found) {
        errors.push({
          code: 'target.notFound',
          message: `Group "${target.objectId}" does not exist in scene`,
          path: '/target/objectId',
        })
      } else if (found.type !== 'group') {
        errors.push({
          code: 'target.typeMismatch',
          message: `Object "${target.objectId}" is a ${found.type}, not a group`,
          path: '/target/objectId',
        })
      }
    } else if (target.type === 'object') {
      if (!target.objectId || !objectById.has(target.objectId)) {
        errors.push({
          code: 'target.notFound',
          message: `Object "${target.objectId}" does not exist in scene`,
          path: '/target/objectId',
        })
      }
    } else if (target.type === 'layer') {
      if (!target.layerId || !layerIds.has(target.layerId)) {
        errors.push({
          code: 'target.notFound',
          message: `Layer "${target.layerId}" does not exist in scene`,
          path: '/target/layerId',
        })
      }
    } else if (target.type === 'workspace') {
      if (target.region) {
        if (target.region.width <= 0 || target.region.height <= 0 || !Number.isFinite(target.region.x) || !Number.isFinite(target.region.y)) {
          errors.push({
            code: 'target.invalidRegion',
            message: 'Workspace region requires finite coordinates and positive width and height',
            path: '/target/region',
          })
        }
      } else if (target.workspaceId && !workspaceIds.has(target.workspaceId)) {
        errors.push({
          code: 'target.notFound',
          message: `Workspace "${target.workspaceId}" does not exist in scene`,
          path: '/target/workspaceId',
        })
      }
    } else if (target.type !== 'scene') {
      errors.push({
        code: 'options.target',
        message: 'Unsupported export target scope',
        path: '/target/type',
      })
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  }
}
