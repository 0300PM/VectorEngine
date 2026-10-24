import type {
  ExportRegion,
  ExportTarget,
  FitMode,
  SceneCatalogEntry,
} from './types'
import type {
  Point,
  SceneGradient,
  SceneLayer,
  SceneObject,
  SceneWorkspace,
  Transform,
  VectorScene,
} from '@/types/scene'

export interface AffineMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface ResolvedViewport {
  sourceBox: ExportRegion
  viewBox: ExportRegion
  outputWidth: number
  outputHeight: number
  fitMode: FitMode
  clipToBounds: boolean
}

export const identityMatrix = (): AffineMatrix => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })

export const multiplyMatrix = (left: AffineMatrix, right: AffineMatrix): AffineMatrix => ({
  a: left.a * right.a + left.c * right.b,
  b: left.b * right.a + left.d * right.b,
  c: left.a * right.c + left.c * right.d,
  d: left.b * right.c + left.d * right.d,
  e: left.a * right.e + left.c * right.f + left.e,
  f: left.b * right.e + left.d * right.f + left.f,
})

export const applyMatrix = (matrix: AffineMatrix, point: Point): Point => ({
  x: matrix.a * point.x + matrix.c * point.y + matrix.e,
  y: matrix.b * point.x + matrix.d * point.y + matrix.f,
})

export const matrixFromTransform = (transform?: Transform): AffineMatrix => {
  if (!transform) {
    return identityMatrix()
  }
  const translateX = transform.translateX ?? 0
  const translateY = transform.translateY ?? 0
  const rotation = ((transform.rotate ?? 0) * Math.PI) / 180
  const scaleX = transform.scaleX ?? 1
  const scaleY = transform.scaleY ?? scaleX
  const skewX = Math.tan(((transform.skewX ?? 0) * Math.PI) / 180)
  const skewY = Math.tan(((transform.skewY ?? 0) * Math.PI) / 180)
  const originX = transform.originX ?? 0
  const originY = transform.originY ?? 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  const parts: AffineMatrix[] = [
    { a: 1, b: 0, c: 0, d: 1, e: translateX + originX, f: translateY + originY },
    { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 },
    { a: 1, b: 0, c: skewX, d: 1, 0: 0, f: 0 } as unknown as AffineMatrix,
  ]
  void parts

  const mTranslate: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: translateX + originX, f: translateY + originY }
  const mRotate: AffineMatrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
  const mSkewX: AffineMatrix = { a: 1, b: 0, c: skewX, d: 1, e: 0, f: 0 }
  const mSkewY: AffineMatrix = { a: 1, b: skewY, c: 0, d: 1, e: 0, f: 0 }
  const mScale: AffineMatrix = { a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 }
  const mOriginBack: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: -originX, f: -originY }

  return [mTranslate, mRotate, mSkewX, mSkewY, mScale, mOriginBack].reduce(multiplyMatrix)
}

const strokeHalfWidth = (object: SceneObject, matrix: AffineMatrix): number => {
  const defaultStroke = object.type === 'line' || object.type === 'polyline' ? '#171717' : undefined
  const stroke = object.stroke ?? defaultStroke
  if (!stroke || stroke === 'none') {
    return 0
  }
  const width = object.strokeWidth ?? 1
  if (width <= 0) {
    return 0
  }
  const scale = (Math.hypot(matrix.a, matrix.b) + Math.hypot(matrix.c, matrix.d)) * 0.5
  return width * scale * 0.5
}

const samplePathCoordinates = (pathData: string): Point[] => {
  const tokens = pathData.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)
  if (!tokens) {
    return []
  }
  const points: Point[] = []
  let index = 0
  let cmd = ''
  let current: Point = { x: 0, y: 0 }
  let start: Point = { x: 0, y: 0 }

  const nextNum = (): number => Number(tokens[index++] ?? 0)
  const isCmd = (token: string | undefined): boolean => Boolean(token && /^[A-Za-z]$/.test(token))

  while (index < tokens.length) {
    if (isCmd(tokens[index])) {
      cmd = tokens[index++]!
    }
    const rel = cmd >= 'a' && cmd <= 'z'
    const upper = cmd.toUpperCase()
    if (upper === 'Z') {
      current = { ...start }
      cmd = ''
      continue
    }
    if (upper === 'M' || upper === 'L' || upper === 'T') {
      const x = nextNum()
      const y = nextNum()
      current = rel ? { x: current.x + x, y: current.y + y } : { x, y }
      points.push(current)
      if (upper === 'M') {
        start = { ...current }
        cmd = rel ? 'l' : 'L'
      }
    } else if (upper === 'H') {
      const x = nextNum()
      current = { x: rel ? current.x + x : x, y: current.y }
      points.push(current)
    } else if (upper === 'V') {
      const y = nextNum()
      current = { x: current.x, y: rel ? current.y + y : y }
      points.push(current)
    } else if (upper === 'C') {
      const c1x = nextNum()
      const c1y = nextNum()
      const c2x = nextNum()
      const c2y = nextNum()
      const x = nextNum()
      const y = nextNum()
      const p0 = current
      const p1 = rel ? { x: current.x + c1x, y: current.y + c1y } : { x: c1x, y: c1y }
      const p2 = rel ? { x: current.x + c2x, y: current.y + c2y } : { x: c2x, y: c2y }
      const p3 = rel ? { x: current.x + x, y: current.y + y } : { x, y }
      for (let step = 1; step <= 16; step += 1) {
        const t = step / 16
        const inv = 1 - t
        points.push({
          x: inv ** 3 * p0.x + 3 * inv ** 2 * t * p1.x + 3 * inv * t ** 2 * p2.x + t ** 3 * p3.x,
          y: inv ** 3 * p0.y + 3 * inv ** 2 * t * p1.y + 3 * inv * t ** 2 * p2.y + t ** 3 * p3.y,
        })
      }
      current = p3
    } else if (upper === 'S' || upper === 'Q') {
      const c1x = nextNum()
      const c1y = nextNum()
      const x = nextNum()
      const y = nextNum()
      const p0 = current
      const ctrl = rel ? { x: current.x + c1x, y: current.y + c1y } : { x: c1x, y: c1y }
      const end = rel ? { x: current.x + x, y: current.y + y } : { x, y }
      for (let step = 1; step <= 12; step += 1) {
        const t = step / 12
        const inv = 1 - t
        points.push({
          x: inv * inv * p0.x + 2 * inv * t * ctrl.x + t * t * end.x,
          y: inv * inv * p0.y + 2 * inv * t * ctrl.y + t * t * end.y,
        })
      }
      current = end
    } else if (upper === 'A') {
      const rx = Math.abs(nextNum())
      const ry = Math.abs(nextNum())
      nextNum()
      nextNum()
      nextNum()
      const x = nextNum()
      const y = nextNum()
      const end = rel ? { x: current.x + x, y: current.y + y } : { x, y }
      points.push(
        { x: Math.min(current.x, end.x) - rx, y: Math.min(current.y, end.y) - ry },
        { x: Math.max(current.x, end.x) + rx, y: Math.max(current.y, end.y) + ry },
        end,
      )
      current = end
    } else {
      break
    }
  }
  return points
}

interface BoundsBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const regionFromBox = (box: BoundsBox): ExportRegion => ({
  x: box.minX,
  y: box.minY,
  width: Math.max(0, box.maxX - box.minX),
  height: Math.max(0, box.maxY - box.minY),
})

const mergeBoxes = (boxes: BoundsBox[]): BoundsBox | null => {
  if (boxes.length === 0) {
    return null
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const box of boxes) {
    minX = Math.min(minX, box.minX)
    minY = Math.min(minY, box.minY)
    maxX = Math.max(maxX, box.maxX)
    maxY = Math.max(maxY, box.maxY)
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

const computeObjectBox = (
  object: SceneObject,
  parentMatrix: AffineMatrix,
  includeHidden: boolean,
): BoundsBox | null => {
  if (!includeHidden && object.visible === false) {
    return null
  }
  const matrix = multiplyMatrix(parentMatrix, matrixFromTransform(object.transform))
  const pad = strokeHalfWidth(object, matrix)

  const boxFromPoints = (points: Point[]): BoundsBox | null => {
    if (points.length === 0) {
      return null
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const raw of points) {
      const pt = applyMatrix(matrix, raw)
      minX = Math.min(minX, pt.x)
      minY = Math.min(minY, pt.y)
      maxX = Math.max(maxX, pt.x)
      maxY = Math.max(maxY, pt.y)
    }
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
  }

  switch (object.type) {
    case 'rect':
      return boxFromPoints([
        { x: object.x, y: object.y },
        { x: object.x + object.width, y: object.y },
        { x: object.x + object.width, y: object.y + object.height },
        { x: object.x, y: object.y + object.height },
      ])
    case 'circle': {
      const center = applyMatrix(matrix, { x: object.cx, y: object.cy })
      const ex = Math.hypot(matrix.a * object.radius, matrix.c * object.radius)
      const ey = Math.hypot(matrix.b * object.radius, matrix.d * object.radius)
      return {
        minX: center.x - ex - pad,
        minY: center.y - ey - pad,
        maxX: center.x + ex + pad,
        maxY: center.y + ey + pad,
      }
    }
    case 'ellipse': {
      const center = applyMatrix(matrix, { x: object.cx, y: object.cy })
      const ex = Math.hypot(matrix.a * object.rx, matrix.c * object.ry)
      const ey = Math.hypot(matrix.b * object.rx, matrix.d * object.ry)
      return {
        minX: center.x - ex - pad,
        minY: center.y - ey - pad,
        maxX: center.x + ex + pad,
        maxY: center.y + ey + pad,
      }
    }
    case 'line':
      return boxFromPoints([
        { x: object.x1, y: object.y1 },
        { x: object.x2, y: object.y2 },
      ])
    case 'polygon':
    case 'polyline':
      return boxFromPoints(object.points)
    case 'path':
      return boxFromPoints(samplePathCoordinates(object.d))
    case 'text': {
      const fontSize = object.fontSize ?? 16
      const advance = Math.max(1, fontSize * 0.6 + (object.letterSpacing ?? 0))
      const width = Math.max(fontSize * 0.5, object.content.length * advance)
      const anchor = object.textAnchor ?? 'start'
      const x0 = anchor === 'middle' ? object.x - width * 0.5 : anchor === 'end' ? object.x - width : object.x
      const top = object.y - fontSize * 0.9
      const bottom = object.y + fontSize * 0.25
      return boxFromPoints([
        { x: x0, y: top },
        { x: x0 + width, y: top },
        { x: x0 + width, y: bottom },
        { x: x0, y: bottom },
      ])
    }
    case 'group': {
      const childBoxes = object.children
        .map((child) => computeObjectBox(child, matrix, includeHidden))
        .filter((item): item is BoundsBox => item !== null)
      return mergeBoxes(childBoxes)
    }
  }
}

export const collectAllGradients = (scene: VectorScene): SceneGradient[] => [
  ...(scene.gradients ?? []),
  ...(scene.document.gradients ?? []),
]

export const collectSceneCatalog = (scene: VectorScene): {
  objects: SceneCatalogEntry[]
  groups: SceneCatalogEntry[]
  layers: { id: string; label: string; visible: boolean }[]
  workspaces: SceneWorkspace[]
} => {
  const entries: SceneCatalogEntry[] = []
  const layerMap = new Map<string, { id: string; label: string; visible: boolean }>()

  const visit = (list: SceneObject[], depth: number, inheritedLayer?: string): void => {
    for (const object of list) {
      const layerId = object.layerId ?? inheritedLayer
      if (layerId && !layerMap.has(layerId)) {
        layerMap.set(layerId, { id: layerId, label: layerId, visible: true })
      }
      entries.push({
        id: object.id,
        label: object.name ?? object.id,
        type: object.type,
        depth,
        visible: object.visible !== false,
        ...(layerId ? { layerId } : {}),
      })
      if (object.type === 'group') {
        visit(object.children, depth + 1, layerId)
      }
    }
  }

  for (const layer of scene.layers ?? []) {
    layerMap.set(layer.id, {
      id: layer.id,
      label: layer.name ?? layer.id,
      visible: layer.visible !== false,
    })
    visit(layer.objects, 0, layer.id)
  }
  visit(scene.objects, 0)

  return {
    objects: entries,
    groups: entries.filter((entry) => entry.type === 'group'),
    layers: [...layerMap.values()],
    workspaces: scene.document.workspaces ?? [],
  }
}

const cloneVisibility = (object: SceneObject, forceVisible: boolean): SceneObject => {
  if (object.type === 'group') {
    const children = object.children
      .filter((child) => forceVisible || child.visible !== false)
      .map((child) => cloneVisibility(child, forceVisible))
    return {
      ...object,
      ...(forceVisible ? { visible: true } : {}),
      children,
    }
  }
  return forceVisible ? { ...object, visible: true } : { ...object }
}

const pruneByIds = (
  object: SceneObject,
  selected: Set<string>,
  includeHidden: boolean,
): SceneObject | null => {
  if (!includeHidden && object.visible === false) {
    return null
  }
  if (selected.has(object.id)) {
    return cloneVisibility(object, includeHidden)
  }
  if (object.type === 'group') {
    const children = object.children
      .map((child) => pruneByIds(child, selected, includeHidden))
      .filter((item): item is SceneObject => item !== null)
    if (children.length > 0) {
      return { ...object, visible: true, children }
    }
  }
  return null
}

const pruneByLayer = (
  object: SceneObject,
  layerId: string,
  includeHidden: boolean,
): SceneObject | null => {
  if (!includeHidden && object.visible === false) {
    return null
  }
  if (object.layerId === layerId) {
    return cloneVisibility(object, includeHidden)
  }
  if (object.type === 'group') {
    const children = object.children
      .map((child) => pruneByLayer(child, layerId, includeHidden))
      .filter((item): item is SceneObject => item !== null)
    if (children.length > 0) {
      return { ...object, visible: true, children }
    }
  }
  return null
}

export const extractScopedScene = (
  scene: VectorScene,
  target: ExportTarget,
  includeHidden = false,
): VectorScene => {
  const baseLayers = scene.layers ?? []

  if (target.type === 'scene' || target.type === 'workspace') {
    const layers: SceneLayer[] = baseLayers
      .filter((layer) => includeHidden || layer.visible !== false)
      .map((layer) => ({
        ...layer,
        visible: true,
        objects: layer.objects
          .filter((item) => includeHidden || item.visible !== false)
          .map((item) => cloneVisibility(item, includeHidden)),
      }))
    const objects = scene.objects
      .filter((item) => includeHidden || item.visible !== false)
      .map((item) => cloneVisibility(item, includeHidden))
    return {
      version: scene.version,
      document: { ...scene.document },
      ...(scene.gradients ? { gradients: scene.gradients } : {}),
      ...(layers.length > 0 ? { layers } : {}),
      objects,
    }
  }

  if (target.type === 'layer') {
    const layers: SceneLayer[] = []
    for (const layer of baseLayers) {
      if (layer.id === target.layerId) {
        if (includeHidden || layer.visible !== false) {
          layers.push({
            ...layer,
            visible: true,
            objects: layer.objects
              .filter((item) => includeHidden || item.visible !== false)
              .map((item) => cloneVisibility(item, includeHidden)),
          })
        }
      } else if (includeHidden || layer.visible !== false) {
        const matched = layer.objects
          .map((item) => pruneByLayer(item, target.layerId, includeHidden))
          .filter((item): item is SceneObject => item !== null)
        if (matched.length > 0) {
          layers.push({ ...layer, visible: true, objects: matched })
        }
      }
    }
    const objects = scene.objects
      .map((item) => pruneByLayer(item, target.layerId, includeHidden))
      .filter((item): item is SceneObject => item !== null)

    return {
      version: scene.version,
      document: { ...scene.document },
      ...(scene.gradients ? { gradients: scene.gradients } : {}),
      ...(layers.length > 0 ? { layers } : {}),
      objects,
    }
  }

  const selectedIds = new Set<string>(
    target.type === 'group' || target.type === 'object'
      ? [target.objectId]
      : target.objectIds,
  )

  const layers: SceneLayer[] = []
  for (const layer of baseLayers) {
    if (!includeHidden && layer.visible === false) {
      continue
    }
    const matched = layer.objects
      .map((item) => pruneByIds(item, selectedIds, includeHidden))
      .filter((item): item is SceneObject => item !== null)
    if (matched.length > 0) {
      layers.push({ ...layer, visible: true, objects: matched })
    }
  }

  const objects = scene.objects
    .map((item) => pruneByIds(item, selectedIds, includeHidden))
    .filter((item): item is SceneObject => item !== null)

  return {
    version: scene.version,
    document: { ...scene.document },
    ...(scene.gradients ? { gradients: scene.gradients } : {}),
    ...(layers.length > 0 ? { layers } : {}),
    objects,
  }
}

export const computeSceneContentBounds = (
  scene: VectorScene,
  includeHidden = false,
): ExportRegion | null => {
  const boxes: BoundsBox[] = []
  const identity = identityMatrix()

  for (const layer of scene.layers ?? []) {
    if (!includeHidden && layer.visible === false) {
      continue
    }
    for (const object of layer.objects) {
      const box = computeObjectBox(object, identity, includeHidden)
      if (box) {
        boxes.push(box)
      }
    }
  }

  for (const object of scene.objects) {
    const box = computeObjectBox(object, identity, includeHidden)
    if (box) {
      boxes.push(box)
    }
  }

  const merged = mergeBoxes(boxes)
  return merged ? regionFromBox(merged) : null
}

export const resolveExportViewport = (
  originalScene: VectorScene,
  scopedScene: VectorScene,
  options: {
    target?: ExportTarget
    scale?: number
    width?: number
    height?: number
    fitMode?: FitMode
    preserveAspectRatio?: boolean
    trimToBounds?: boolean
    clipToBounds?: boolean
    margin?: number
  },
): ResolvedViewport => {
  const target = options.target ?? { type: 'scene' }
  const margin = Math.max(0, options.margin ?? 0)
  const scale = options.scale ?? 1
  const fitMode: FitMode = options.fitMode ?? (options.preserveAspectRatio === false ? 'stretch' : 'contain')

  let sourceBox: ExportRegion = {
    x: 0,
    y: 0,
    width: originalScene.document.width,
    height: originalScene.document.height,
  }

  if (target.type === 'workspace') {
    if (target.region) {
      sourceBox = { ...target.region }
    } else if (target.workspaceId) {
      const found = originalScene.document.workspaces?.find((ws) => ws.id === target.workspaceId)
      if (found) {
        sourceBox = { x: found.x, y: found.y, width: found.width, height: found.height }
      }
    }
  }

  if (options.trimToBounds) {
    const tight = computeSceneContentBounds(scopedScene, true)
    if (tight && tight.width > 0 && tight.height > 0) {
      if (target.type === 'workspace') {
        const minX = Math.max(sourceBox.x, tight.x)
        const minY = Math.max(sourceBox.y, tight.y)
        const maxX = Math.min(sourceBox.x + sourceBox.width, tight.x + tight.width)
        const maxY = Math.min(sourceBox.y + sourceBox.height, tight.y + tight.height)
        if (maxX > minX && maxY > minY) {
          sourceBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
        }
      } else {
        sourceBox = tight
      }
    }
  }

  const safeWidth = Math.max(1, sourceBox.width)
  const safeHeight = Math.max(1, sourceBox.height)
  const normalizedSource: ExportRegion = {
    x: sourceBox.x,
    y: sourceBox.y,
    width: safeWidth,
    height: safeHeight,
  }

  const viewBox: ExportRegion = {
    x: normalizedSource.x - margin,
    y: normalizedSource.y - margin,
    width: normalizedSource.width + margin * 2,
    height: normalizedSource.height + margin * 2,
  }

  const outputWidth = options.width && options.width > 0
    ? Math.round(options.width)
    : Math.max(1, Math.round(viewBox.width * scale))
  const outputHeight = options.height && options.height > 0
    ? Math.round(options.height)
    : Math.max(1, Math.round(viewBox.height * scale))

  return {
    sourceBox: normalizedSource,
    viewBox,
    outputWidth,
    outputHeight,
    fitMode,
    clipToBounds: Boolean(options.clipToBounds),
  }
}
