import { identityMatrix, type AffineMatrix } from '@/export/bounds'
import { objectBounds } from './hitTest'
import { invertMatrix, mergeBounds, type Bounds } from './geometry'
import type { SceneObject, Transform } from '@/types/scene'

export type AlignEdge = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'
export type DistributeAxis = 'x' | 'y'

export interface ObjectPlacement {
  object: SceneObject
  deltaX: number
  deltaY: number
}

export type ScenePropertyKey = keyof SceneObject | 'width' | 'height'

export type ScenePropertySetter = <K extends ScenePropertyKey>(
  object: SceneObject,
  key: K,
  value: K extends 'width' | 'height' ? number : SceneObject[K & keyof SceneObject],
) => void

export type ParentMatrixResolver = (object: SceneObject) => AffineMatrix

export interface AlignOptions {
  key?: SceneObject | null
  documentBounds?: Bounds | null
  matchWidth?: boolean
  matchHeight?: boolean
  getParentMatrix?: ParentMatrixResolver
}

export interface DistributeOptions {
  getParentMatrix?: ParentMatrixResolver
}

export const ALIGN_LABELS: Record<AlignEdge, string> = {
  left: 'Wyrównaj do lewej',
  'center-h': 'Wyrównaj do środka pionowego',
  right: 'Wyrównaj do prawej',
  top: 'Wyrównaj do góry',
  'center-v': 'Wyrównaj do środka poziomego',
  bottom: 'Wyrównaj do dołu',
}

export const DISTRIBUTE_LABELS: Record<DistributeAxis, string> = {
  x: 'Równomiernie w poziomie',
  y: 'Równomiernie w pionie',
}

const withTranslation = (object: SceneObject, deltaX: number, deltaY: number): Transform => {
  const transform = object.transform ?? {}
  return {
    ...transform,
    translateX: (transform.translateX ?? 0) + deltaX,
    translateY: (transform.translateY ?? 0) + deltaY,
  }
}

const mutate: ScenePropertySetter = (object, key, value) => {
  ;(object as unknown as Record<ScenePropertyKey, unknown>)[key] = value
}


const setTranslation = (
  object: SceneObject,
  deltaX: number,
  deltaY: number,
  setProperty: ScenePropertySetter,
): void => {
  setProperty(object, 'transform', withTranslation(object, deltaX, deltaY))
}

export const applyPlacements = (
  objects: readonly SceneObject[],
  placements: readonly ObjectPlacement[],
  setProperty: ScenePropertySetter,
  getParentMatrix: ParentMatrixResolver = () => identityMatrix(),
): void => {
  const byId = new Map(objects.map((object) => [object.id, object]))
  for (const placement of placements) {
    const target = byId.get(placement.object.id)
    if (!target) {
      continue
    }
    const inverse = invertMatrix(getParentMatrix(target))
    if (!inverse) {
      continue
    }
    const deltaX = inverse.a * placement.deltaX + inverse.c * placement.deltaY + inverse.e
    const deltaY = inverse.b * placement.deltaX + inverse.d * placement.deltaY + inverse.f
    setTranslation(target, deltaX, deltaY, setProperty)
  }
}

const edgeOf = (box: Bounds, edge: AlignEdge): number => {
  switch (edge) {
    case 'left':
      return box.minX
    case 'right':
      return box.maxX
    case 'top':
      return box.minY
    case 'bottom':
      return box.maxY
    case 'center-h':
      return (box.minX + box.maxX) / 2
    default:
      return (box.minY + box.maxY) / 2
  }
}

export const computeAlignment = (
  objects: readonly SceneObject[],
  edge: AlignEdge,
  relative: 'selection' | 'document' | 'key',
  options: AlignOptions = {},
): ObjectPlacement[] => {
  if (objects.length === 0) {
    return []
  }

  const isHorizontal = edge === 'left' || edge === 'center-h' || edge === 'right'
  const getParentMatrix = options.getParentMatrix ?? (() => identityMatrix())
  const boxes = objects.map((object) => ({
    object,
    box: objectBounds(object, getParentMatrix(object)),
  }))
  const present = boxes.filter((entry): entry is { object: SceneObject; box: Bounds } => entry.box !== null)
  if (present.length !== objects.length) {
    return []
  }

  const resolve = (object: SceneObject): Bounds | null => objectBounds(object, getParentMatrix(object))

  let target: number | undefined
  if (relative === 'document') {
    const bounds = options.documentBounds
    if (!bounds) {
      return []
    }
    target = edgeOf(bounds, edge)
  } else if (relative === 'key' && options.key) {
    const key = resolve(options.key)
    if (!key) {
      return []
    }
    target = edgeOf(key, edge)
  } else {
    const bounds = mergeBounds(objects.map((object) => resolve(object)).filter((box): box is Bounds => box !== null))
    if (!bounds) {
      return []
    }
    target = edgeOf(bounds, edge)
  }

  if (target === undefined) {
    return []
  }

  return present.map(({ object, box }) => {
    const delta = target - edgeOf(box, edge)
    return isHorizontal ? { object, deltaX: delta, deltaY: 0 } : { object, deltaX: 0, deltaY: delta }
  })
}

export const computeDistribution = (
  objects: readonly SceneObject[],
  axis: DistributeAxis,
  options: DistributeOptions = {},
): ObjectPlacement[] => {
  if (objects.length < 3) {
    return []
  }

  const isHorizontal = axis === 'x'
  const startEdge = isHorizontal ? 'minX' : 'minY'
  const endEdge = isHorizontal ? 'maxX' : 'maxY'
  const getParentMatrix = options.getParentMatrix ?? (() => identityMatrix())

  const boxes: { object: SceneObject; box: Bounds }[] = []
  for (const object of objects) {
    const box = objectBounds(object, getParentMatrix(object))
    if (!box) {
      return []
    }
    boxes.push({ object, box })
  }

  const ordered = [...boxes].sort((left, right) => left.box[startEdge] - right.box[startEdge])
  const first = ordered[0]!.box[startEdge]
  const last = ordered[ordered.length - 1]!.box[endEdge]
  const total = last - first
  const used = ordered.reduce((sum, entry) => sum + (entry.box[endEdge] - entry.box[startEdge]), 0)
  const gap = (total - used) / (ordered.length - 1)

  const placements: ObjectPlacement[] = []
  let cursor = ordered[0]!.box[startEdge]
  for (const { object, box } of ordered) {
    const width = box[endEdge] - box[startEdge]
    const delta = cursor - box[startEdge]
    placements.push(
      isHorizontal ? { object, deltaX: delta, deltaY: 0 } : { object, deltaX: 0, deltaY: delta },
    )
    cursor += gap + width
  }
  return placements
}

const sizeTarget = (
  objects: readonly SceneObject[],
  axis: 'width' | 'height',
  getParentMatrix: ParentMatrixResolver,
): number | undefined => {
  if (objects.length < 2) {
    return undefined
  }
  const first = objectBounds(objects[0]!, getParentMatrix(objects[0]!))
  if (!first) {
    return undefined
  }
  return axis === 'width' ? first.maxX - first.minX : first.maxY - first.minY
}

export const applySizeMatch = (
  objects: readonly SceneObject[],
  matchWidth: boolean,
  matchHeight: boolean,
  setProperty: ScenePropertySetter,
  getParentMatrix: ParentMatrixResolver = () => identityMatrix(),
): void => {
  const targetWidth = matchWidth ? sizeTarget(objects, 'width', getParentMatrix) : undefined
  const targetHeight = matchHeight ? sizeTarget(objects, 'height', getParentMatrix) : undefined
  for (const object of objects) {
    const size = object as unknown as { width?: number; height?: number }
    if (targetWidth !== undefined && typeof size.width === 'number') {
      setProperty(object, 'width', targetWidth)
    }
    if (targetHeight !== undefined && typeof size.height === 'number') {
      setProperty(object, 'height', targetHeight)
    }
  }
}

export const alignObjects = (
  objects: readonly SceneObject[],
  edge: AlignEdge,
  relative: 'selection' | 'document' | 'key',
  options: AlignOptions = {},
): ObjectPlacement[] => {
  const getParentMatrix = options.getParentMatrix ?? (() => identityMatrix())
  const setProperty: ScenePropertySetter = mutate
  const placements = computeAlignment(objects, edge, relative, options)
  applyPlacements(objects, placements, setProperty, getParentMatrix)
  applySizeMatch(objects, options.matchWidth === true, options.matchHeight === true, setProperty, getParentMatrix)
  return placements
}

export const distributeObjects = (
  objects: readonly SceneObject[],
  axis: DistributeAxis,
  options: DistributeOptions = {},
): ObjectPlacement[] => {
  const getParentMatrix = options.getParentMatrix ?? (() => identityMatrix())
  const setProperty: ScenePropertySetter = mutate
  const placements = computeDistribution(objects, axis, options)
  applyPlacements(objects, placements, setProperty, getParentMatrix)
  return placements
}

export const applyAlignment = (
  objects: readonly SceneObject[],
  edge: AlignEdge,
  relative: 'selection' | 'document' | 'key',
  options: AlignOptions = {},
): void => {
  alignObjects(objects, edge, relative, options)
}

export const applyDistribution = (
  objects: readonly SceneObject[],
  axis: DistributeAxis,
  options: DistributeOptions = {},
): void => {
  distributeObjects(objects, axis, options)
}

export const alignToDocument = (
  objects: readonly SceneObject[],
  edge: AlignEdge,
  documentBounds: Bounds | null,
): void => {
  alignObjects(objects, edge, 'document', { documentBounds })
}
