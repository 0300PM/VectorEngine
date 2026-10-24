import {
  applyMatrix,
  matrixFromTransform,
  multiplyMatrix,
  type AffineMatrix,
} from '@/export/bounds'
import { flattenNodes } from '@/paths/model'
import { parsePathData } from '@/paths/parser'
import type { Point, SceneObject, TextObject } from '@/types/scene'
import {
  distanceToPolyline,
  distanceToSegment,
  expandBounds,
  invertMatrix,
  mergeBounds,
  pointInPolygon,
  pointInRect,
  transformBounds,
  type Bounds,
  type Rect,
} from './geometry'

const MIN_STROKE_WIDTH = 1
const PICK_TOLERANCE = 3

const strokeOf = (object: SceneObject): string | undefined => {
  if (object.stroke && object.stroke !== 'none') {
    return object.stroke
  }
  if (object.type === 'line' || object.type === 'polyline') {
    return '#171717'
  }
  return undefined
}

const strokeScale = (matrix: AffineMatrix): number =>
  (Math.hypot(matrix.a, matrix.b) + Math.hypot(matrix.c, matrix.d)) / 2

const hitTolerance = (object: SceneObject, matrix: AffineMatrix): number => {
  const stroke = strokeOf(object)
  const width = object.strokeWidth ?? MIN_STROKE_WIDTH
  const halfWidth = stroke && width > 0 ? (width * strokeScale(matrix)) / 2 : 0
  if (object.type === 'line' || object.type === 'polyline' || object.type === 'path') {
    return Math.max(halfWidth, PICK_TOLERANCE)
  }
  return halfWidth
}

const textBox = (object: TextObject): Rect => {
  const fontSize = object.fontSize ?? 16
  const advance = Math.max(1, fontSize * 0.6 + (object.letterSpacing ?? 0))
  const width = Math.max(fontSize * 0.5, object.content.length * advance)
  const anchor = object.textAnchor ?? 'start'
  const x0 = anchor === 'middle' ? object.x - width / 2 : anchor === 'end' ? object.x - width : object.x
  return { x: x0, y: object.y - fontSize * 0.9, width, height: fontSize * 1.15 }
}

const pointsBounds = (points: { x: number; y: number }[]): Bounds | null => {
  if (points.length === 0) {
    return null
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}

export const localBounds = (object: SceneObject): Bounds | null => {
  switch (object.type) {
    case 'rect':
      return {
        minX: object.x,
        minY: object.y,
        maxX: object.x + object.width,
        maxY: object.y + object.height,
      }
    case 'circle':
      return {
        minX: object.cx - object.radius,
        minY: object.cy - object.radius,
        maxX: object.cx + object.radius,
        maxY: object.cy + object.radius,
      }
    case 'ellipse':
      return {
        minX: object.cx - object.rx,
        minY: object.cy - object.ry,
        maxX: object.cx + object.rx,
        maxY: object.cy + object.ry,
      }
    case 'line':
      return pointsBounds([
        { x: object.x1, y: object.y1 },
        { x: object.x2, y: object.y2 },
      ])
    case 'polygon':
    case 'polyline':
      return pointsBounds(object.points)
    case 'path':
      return pointsBounds(
        flattenNodes(parsePathData(object.d)).map((node) => ({ x: node.x, y: node.y })),
      )
    case 'text': {
      const box = textBox(object)
      return { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height }
    }
    case 'group': {
      const childBoxes = object.children
        .map((child) => localBounds(child))
        .filter((box): box is Bounds => box !== null)
      return mergeBounds(childBoxes)
    }
    default:
      return null
  }
}

export const objectBounds = (
  object: SceneObject,
  parentMatrix: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
): Bounds | null => {
  const local = localBounds(object)
  if (!local) {
    return null
  }
  const matrix = multiplyMatrix(parentMatrix, matrixFromTransform(object.transform))
  const padded = expandBounds(transformBounds(local, matrix), hitTolerance(object, matrix))
  return padded.maxX > padded.minX || padded.maxY > padded.minY ? padded : null
}

export const sceneBounds = (objects: readonly SceneObject[]): Bounds | null => {
  const boxes = objects
    .map((object) => objectBounds(object))
    .filter((box): box is Bounds => box !== null)
  return mergeBounds(boxes)
}

export const isSelectable = (object: SceneObject, includeHidden: boolean): boolean =>
  includeHidden || object.visible !== false

export const hitTestObject = (
  object: SceneObject,
  documentPoint: { x: number; y: number },
  parentMatrix: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
): boolean => {
  const matrix = multiplyMatrix(parentMatrix, matrixFromTransform(object.transform))
  const inverse = invertMatrix(matrix)
  const local = inverse ? applyMatrix(inverse, documentPoint) : documentPoint
  const tolerance = hitTolerance(object, matrix)

  switch (object.type) {
    case 'rect':
      return pointInRect(local, { x: object.x, y: object.y, width: object.width, height: object.height })
    case 'circle':
      return Math.hypot(local.x - object.cx, local.y - object.cy) <= object.radius + tolerance
    case 'ellipse': {
      if (object.rx <= 0 || object.ry <= 0) {
        return Math.hypot(local.x - object.cx, local.y - object.cy) <= tolerance
      }
      const dx = (local.x - object.cx) / object.rx
      const dy = (local.y - object.cy) / object.ry
      return dx * dx + dy * dy <= 1
    }
    case 'line':
      return (
        distanceToSegment(local, { x: object.x1, y: object.y1 }, { x: object.x2, y: object.y2 }) <=
        tolerance
      )
    case 'polygon': {
      const points = object.points
      return pointInPolygon(local, points) || distanceToPolyline(local, points) <= tolerance
    }
    case 'polyline':
      return distanceToPolyline(local, object.points) <= tolerance
    case 'path': {
      const model = parsePathData(object.d)
      const nodes = flattenNodes(model).map((node) => ({ x: node.x, y: node.y }))
      const closed = model.subpaths.some((subpath) => subpath.closed)
      if (closed && pointInPolygon(local, nodes)) {
        return true
      }
      return distanceToPolyline(local, nodes) <= tolerance
    }
    case 'text':
      return pointInRect(local, textBox(object))
    case 'group':
      return object.children.some((child) => hitTestObject(child, documentPoint, matrix))
    default:
      return false
  }
}

export const hitTestScene = (
  objects: readonly SceneObject[],
  documentPoint: { x: number; y: number },
  includeHidden = false,
): SceneObject | null => {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index]!
    if (!isSelectable(object, includeHidden)) {
      continue
    }
    if (hitTestObject(object, documentPoint)) {
      return object
    }
  }
  return null
}

const circlePoints = (cx: number, cy: number, rx: number, ry: number, segments = 32): Point[] => {
  const points: Point[] = []
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry })
  }
  return points
}

export const objectOutline = (
  object: SceneObject,
  parentMatrix: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
): Point[][] => {
  const matrix = multiplyMatrix(parentMatrix, matrixFromTransform(object.transform))
  const transform = (point: Point): Point => applyMatrix(matrix, point)
  const outline = (points: Point[]): Point[][] => (points.length === 0 ? [] : [points.map(transform)])

  switch (object.type) {
    case 'rect':
      return outline([
        { x: object.x, y: object.y },
        { x: object.x + object.width, y: object.y },
        { x: object.x + object.width, y: object.y + object.height },
        { x: object.x, y: object.y + object.height },
      ])
    case 'circle':
      return outline(circlePoints(object.cx, object.cy, object.radius, object.radius))
    case 'ellipse':
      return outline(circlePoints(object.cx, object.cy, object.rx, object.ry))
    case 'line':
      return outline([
        { x: object.x1, y: object.y1 },
        { x: object.x2, y: object.y2 },
      ])
    case 'polygon':
    case 'polyline':
      return outline(object.points)
    case 'path':
      return outline(flattenNodes(parsePathData(object.d)).map((node) => ({ x: node.x, y: node.y })))
    case 'text': {
      const box = textBox(object)
      return outline([
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        { x: box.x, y: box.y + box.height },
      ])
    }
    case 'group':
      return object.children.flatMap((child) => objectOutline(child, matrix))
    default:
      return []
  }
}

export const collectHitTargets = (
  objects: readonly SceneObject[],
  includeHidden = false,
): SceneObject[] => objects.filter((object) => isSelectable(object, includeHidden))
