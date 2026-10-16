import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import sceneSchema from '../../../../schemas/vector-scene.schema.json'
import type { ValidationIssue, ValidationResult } from '@/types/engine'
import type { SceneObject, VectorScene } from '@/types/scene'
import { engineLimits } from './limits'
import { isValidPathData } from './pathValidator'

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false })
const validateSchema = ajv.compile(sceneSchema)
const pathDataPattern = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/

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
    const path = pathFromError(error)
    const message = messageFromError(error)
    const key = `${path}:${message}`
    unique.set(key, {
      code: `schema.${error.keyword}`,
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

const semanticIssues = (scene: VectorScene): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  const ids = new Set<string>()
  let objectCount = 0

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

  if (!validateSchema(value)) {
    return { valid: false, issues: schemaIssues(validateSchema.errors) }
  }

  const scene = value as unknown as VectorScene
  const issues = semanticIssues(scene)
  const valid = issues.every((issue) => issue.severity !== 'error')
  return { valid, issues, ...(valid ? { scene } : {}) }
}
