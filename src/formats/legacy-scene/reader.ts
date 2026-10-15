import {
  createDocument,
  createEllipse,
  createLayer,
  createPath,
  createRectangle,
  formatIssuePath,
  type PaintStyle,
  type VectorDocument,
  type VectorNode,
} from '@/core/document'
import { identityMatrix, linePath, matrixFromTransform, type Matrix2D } from '@/core/geometry'
import { err, ok, type Result } from '@/core/result'
import {
  isRecord,
  tryParseJson,
  type DocumentReader,
  type ImportFailure,
  type ImportResult,
  type ReadInput,
} from '../types'
import {
  legacySceneSchema,
  type LegacyScene,
  type LegacyShape,
  type LegacyTransform,
} from './schema'

const FORMAT_ID = 'legacy-scene'
const DEFAULT_LINE_COLOR = '#000000'

const toPoint = (pair: readonly [number, number] | undefined) =>
  pair ? { x: pair[0], y: pair[1] } : undefined

const toMatrix = (transform: LegacyTransform | undefined): Matrix2D => {
  if (!transform) {
    return identityMatrix
  }
  const translate = toPoint(transform.translate)
  const scale = toPoint(transform.scale)
  const origin = toPoint(transform.origin)
  return matrixFromTransform({
    ...(translate ? { translate } : {}),
    ...(scale ? { scale } : {}),
    ...(origin ? { origin } : {}),
    ...(transform.rotate === undefined ? {} : { rotateDegrees: transform.rotate }),
  })
}

const toStyle = (
  fill: string | undefined,
  stroke: string | undefined,
  width: number,
): PaintStyle => ({
  ...(fill ? { fill: { color: fill } } : {}),
  ...(stroke && width > 0 ? { stroke: { color: stroke, width } } : {}),
})

const toNode = (shape: LegacyShape, index: number): VectorNode => {
  const options = {
    id: `shape_${index + 1}`,
    opacity: shape.opacity,
    transform: toMatrix(shape.transform),
  }
  switch (shape.type) {
    case 'line':
      return createPath(linePath({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }), {
        ...options,
        style: toStyle(
          undefined,
          shape.stroke ?? shape.color ?? DEFAULT_LINE_COLOR,
          shape.thickness,
        ),
      })
    case 'rect':
      return createRectangle(
        { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
        { ...options, style: toStyle(shape.fill, shape.stroke, shape.strokeWidth) },
      )
    case 'circle':
      return createEllipse(
        { cx: shape.cx, cy: shape.cy, rx: shape.r, ry: shape.r },
        { ...options, style: toStyle(shape.fill, shape.stroke, shape.strokeWidth) },
      )
  }
}

export const convertLegacyScene = (scene: LegacyScene, name: string): VectorDocument =>
  createDocument({
    name,
    width: scene.width,
    height: scene.height,
    background: scene.background,
    layers: [createLayer(scene.shapes.map(toNode), { id: 'layer_scene', name: 'Scene' })],
  })

const stripExtension = (fileName: string): string => fileName.replace(/\.[^.]+$/, '')

export const legacySceneReader: DocumentReader = {
  id: FORMAT_ID,
  label: 'Legacy scene JSON',
  extensions: ['.json'],
  mimeType: 'application/json',
  matches(input: ReadInput): boolean {
    const parsed = tryParseJson(input.bytes)
    return isRecord(parsed) && Array.isArray(parsed.shapes) && !('schemaVersion' in parsed)
  },
  read(input: ReadInput): Promise<Result<ImportResult, ImportFailure>> {
    const parsed = legacySceneSchema.safeParse(tryParseJson(input.bytes))
    if (!parsed.success) {
      return Promise.resolve(
        err({
          formatId: FORMAT_ID,
          issues: parsed.error.issues.map((issue) => ({
            path: formatIssuePath(issue.path),
            message: issue.message,
          })),
        }),
      )
    }
    return Promise.resolve(
      ok({
        formatId: FORMAT_ID,
        document: convertLegacyScene(parsed.data, stripExtension(input.fileName)),
        warnings: [{ code: 'legacy_format' }],
      }),
    )
  },
}
