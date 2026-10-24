import type { ErrorObject } from 'ajv'
import type { ValidationIssue, ValidationResult } from '@/types/engine'
import validateSchema from './generated/sceneValidator.js'
import type { SceneGradient, SceneObject, VectorScene } from '@/types/scene'
import { engineLimits } from './limits'
import { isValidPathData } from './pathValidator'

const pathDataPattern = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/
const unsupportedEffectKeys = new Set(['filter', 'mask', 'clipPath'])

const pathFromError = (error: ErrorObject): string => {
  const base = error.instancePath || '$'
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    return `${base}/${error.params.missingProperty}`
  }
  return base
}

const messageFromError = (error: ErrorObject): string => {
  if (error.keyword === 'additionalProperties' && typeof error.params.additionalProperty === 'string') {
    return `Unsupported property “${error.params.additionalProperty}”`
  }
  if (error.keyword === 'unevaluatedProperties' && typeof error.params.unevaluatedProperty === 'string') {
    return `Unsupported property “${error.params.unevaluatedProperty}”`
  }
  if (error.keyword === 'const') {
    return `Must equal ${JSON.stringify(error.params.allowedValue)}`
  }
  return error.message ? `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}` : 'Invalid value'
}

const schemaIssues = (errors: ErrorObject[] | null | undefined): ValidationIssue[] => {
  if (!errors) {
    return []
  }

  const useful = errors.filter((error) => error.keyword !== 'oneOf' && error.keyword !== 'if')
  const unique = new Map<string, ValidationIssue>()
  for (const error of useful) {
    const propName = typeof error.params.additionalProperty === 'string'
      ? error.params.additionalProperty
      : typeof error.params.unevaluatedProperty === 'string'
        ? error.params.unevaluatedProperty
        : null
    const code = propName && unsupportedEffectKeys.has(propName)
      ? `unsupported.${propName}`
      : `schema.${error.keyword}`
    const path = pathFromError(error)
    const message = messageFromError(error)
    const key = `${path}:${message}`
    unique.set(key, {
      code,
      message,
      path,
      severity: 'error',
    })
  }
  return [...unique.values()].slice(0, 24)
}

const parseErrorIssue = (error: unknown, source: string): ValidationIssue => {
  const message = error instanceof Error ? error.message : 'Malformed JSON'
  const match = message.match(/position\s+(\d+)/i)
  const offset = match?.[1] ? Number.parseInt(match[1], 10) : undefined
  let path = '$'

  if (offset !== undefined) {
    const prefix = source.slice(0, offset)
    const line = prefix.split('\n').length
    const lastLineBreak = prefix.lastIndexOf('\n')
    const column = offset - lastLineBreak
    path = `line ${line}, column ${column}`
  }

  return {
    code: 'json.parse',
    message: message.replace(/^JSON\.parse:\s*/i, ''),
    path,
    severity: 'error',
    ...(offset === undefined ? {} : { offset }),
  }
}

const extractGradientId = (paint?: string): string | null => {
  if (!paint || !paint.startsWith('url(#') || !paint.endsWith(')')) {
    return null
  }
  return paint.slice(5, -1)
}

const semanticIssues = (scene: VectorScene): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  const ids = new Set<string>()
  const gradientIds = new Set<string>()
  const layerIds = new Set<string>()
  const workspaceIds = new Set<string>()
  let objectCount = 0

  const registerGradient = (gradient: SceneGradient, path: string): void => {
    if (gradientIds.has(gradient.id)) {
      issues.push({
        code: 'semantic.duplicateGradientId',
        message: `Gradient id “${gradient.id}” is not unique`,
        path: `${path}/id`,
        severity: 'error',
      })
    }
    gradientIds.add(gradient.id)
  }

  for (const [index, gradient] of (scene.gradients ?? []).entries()) {
    registerGradient(gradient, `/gradients/${index}`)
  }
  for (const [index, gradient] of (scene.document.gradients ?? []).entries()) {
    registerGradient(gradient, `/document/gradients/${index}`)
  }
  for (const [index, ws] of (scene.document.workspaces ?? []).entries()) {
    if (workspaceIds.has(ws.id)) {
      issues.push({
        code: 'semantic.duplicateWorkspaceId',
        message: `Workspace id “${ws.id}” is not unique`,
        path: `/document/workspaces/${index}/id`,
        severity: 'error',
      })
    }
    workspaceIds.add(ws.id)
  }

  const checkPaintRef = (paint: string | undefined, path: string): void => {
    const gradId = extractGradientId(paint)
    if (gradId && !gradientIds.has(gradId)) {
      issues.push({
        code: 'semantic.missingGradient',
        message: `Referenced gradient “${gradId}” does not exist`,
        path,
        severity: 'error',
      })
    }
  }

  const walk = (objects: SceneObject[], depth: number, basePath: string): void => {
    if (depth > engineLimits.depth) {
      issues.push({
        code: 'limit.depth',
        message: `Group nesting exceeds ${engineLimits.depth} levels`,
        path: basePath,
        severity: 'error',
      })
      return
    }

    for (const [index, object] of objects.entries()) {
      objectCount += 1
      const path = `${basePath}/${index}`
      if (ids.has(object.id)) {
        issues.push({
          code: 'semantic.duplicateId',
          message: `Object id “${object.id}” is not unique`,
          path: `${path}/id`,
          severity: 'error',
        })
      }
      ids.add(object.id)
      checkPaintRef(object.fill, `${path}/fill`)
      checkPaintRef(object.stroke, `${path}/stroke`)

      if (object.type === 'path') {
        if (object.d.length > engineLimits.pathLength) {
          issues.push({
            code: 'limit.pathLength',
            message: `Path data exceeds ${engineLimits.pathLength.toLocaleString()} characters`,
            path: `${path}/d`,
            severity: 'error',
          })
        }
        if (!pathDataPattern.test(object.d) || !isValidPathData(object.d)) {
          issues.push({
            code: 'semantic.pathData',
            message: 'Path data is malformed or contains unsupported commands',
            path: `${path}/d`,
            severity: 'error',
          })
        }
      }

      if (object.type === 'group') {
        walk(object.children, depth + 1, `${path}/children`)
      }
    }
  }

  for (const [layerIndex, layer] of (scene.layers ?? []).entries()) {
    const layerPath = `/layers/${layerIndex}`
    if (layerIds.has(layer.id)) {
      issues.push({
        code: 'semantic.duplicateLayerId',
        message: `Layer id “${layer.id}” is not unique`,
        path: `${layerPath}/id`,
        severity: 'error',
      })
    }
    layerIds.add(layer.id)
    walk(layer.objects, 1, `${layerPath}/objects`)
  }

  walk(scene.objects, 1, '/objects')

  if (objectCount > engineLimits.objects) {
    issues.push({
      code: 'limit.objectCount',
      message: `Scene contains ${objectCount.toLocaleString()} objects; the limit is ${engineLimits.objects.toLocaleString()}`,
      path: '/objects',
      severity: 'error',
    })
  }

  const pixelCount = scene.document.width * scene.document.height
  if (!Number.isSafeInteger(pixelCount) || pixelCount > engineLimits.outputPixels) {
    issues.push({
      code: 'limit.documentPixels',
      message: `Document area exceeds ${engineLimits.outputPixels.toLocaleString()} pixels`,
      path: '/document',
      severity: 'error',
    })
  }

  if (pixelCount > 16_777_216) {
    issues.push({
      code: 'performance.largeDocument',
      message: 'Large documents may take longer to rasterize',
      path: '/document',
      severity: 'warning',
    })
  }

  return issues
}

export const validateSceneSource = (source: string): ValidationResult => {
  const sourceBytes = new TextEncoder().encode(source).byteLength
  if (sourceBytes > engineLimits.sourceBytes) {
    return {
      valid: false,
      issues: [
        {
          code: 'limit.sourceSize',
          message: `JSON input exceeds ${engineLimits.sourceBytes / 1024 / 1024} MB`,
          path: '$',
          severity: 'error',
        },
      ],
    }
  }

  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    return { valid: false, issues: [parseErrorIssue(error, source)] }
  }

  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>
    const grads = [
      ...(Array.isArray(raw.gradients) ? raw.gradients : []),
      ...(raw.document && typeof raw.document === 'object' && Array.isArray((raw.document as Record<string, unknown>).gradients)
        ? (raw.document as Record<string, unknown>).gradients as unknown[]
        : []),
    ]
    for (const [idx, item] of grads.entries()) {
      if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).type === 'string') {
        const gType = (item as Record<string, unknown>).type as string
        if (gType !== 'linear' && gType !== 'radial') {
          return {
            valid: false,
            issues: [{
              code: 'unsupported.gradient',
              message: `Unsupported gradient type “${gType}”`,
              path: `/gradients/${idx}/type`,
              severity: 'error',
            }],
          }
        }
      }
    }
  }

  if (!validateSchema(value)) {
    return { valid: false, issues: schemaIssues(validateSchema.errors) }
  }

  const scene = value as unknown as VectorScene
  const issues = semanticIssues(scene)
  const valid = issues.every((issue) => issue.severity !== 'error')
  return { valid, issues, ...(valid ? { scene } : {}) }
}
