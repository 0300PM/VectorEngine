import {
  clonePath,
  makeNode,
  pointDistance,
  pointEquals,
  reflect,
  type AffineTransform,
  type HandleKind,
  type HandleMode,
  type PathModel,
  type PathNode,
  type PathSubpath,
  type Point,
} from './model'

export interface SegmentSplit {
  leftCubic: { p0: Point; c1: Point; c2: Point; p3: Point } | null
  leftQuadratic: { p0: Point; c: Point; p3: Point } | null
  rightCubic: { p0: Point; c1: Point; c2: Point; p3: Point } | null
  rightQuadratic: { p0: Point; c: Point; p3: Point } | null
  middle: Point
}

const lerp = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
})

const cloneNode = (node: PathNode): PathNode => ({
  x: node.x,
  y: node.y,
  inHandle: node.inHandle ? { ...node.inHandle } : null,
  outHandle: node.outHandle ? { ...node.outHandle } : null,
  mode: node.mode,
})

const cloneSubpath = (subpath: PathSubpath): PathSubpath => ({
  closed: subpath.closed,
  nodes: subpath.nodes.map(cloneNode),
})

export const segmentKind = (from: PathNode, to: PathNode): 'line' | 'quadratic' | 'cubic' => {
  if (from.outHandle && to.inHandle) {
    return 'cubic'
  }
  if (from.outHandle || to.inHandle) {
    return 'quadratic'
  }
  return 'line'
}

const splitLine = (from: Point, to: Point, t: number): SegmentSplit => ({
  leftCubic: null,
  leftQuadratic: null,
  rightCubic: null,
  rightQuadratic: null,
  middle: lerp(from, to, t),
})

const splitQuadratic = (p0: Point, control: Point, p3: Point, t: number): SegmentSplit => {
  const a = lerp(p0, control, t)
  const b = lerp(control, p3, t)
  const middle = lerp(a, b, t)
  return {
    leftCubic: null,
    leftQuadratic: { p0, c: a, p3: middle },
    rightCubic: null,
    rightQuadratic: { p0: middle, c: b, p3 },
    middle,
  }
}

const splitCubic = (p0: Point, c1: Point, c2: Point, p3: Point, t: number): SegmentSplit => {
  const a = lerp(p0, c1, t)
  const b = lerp(c1, c2, t)
  const c = lerp(c2, p3, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  const middle = lerp(d, e, t)
  return {
    leftCubic: { p0, c1: a, c2: d, p3: middle },
    leftQuadratic: null,
    rightCubic: { p0: middle, c1: e, c2: c, p3 },
    rightQuadratic: null,
    middle,
  }
}

export const splitSegment = (from: PathNode, to: PathNode, t: number): SegmentSplit => {
  if (from.outHandle && to.inHandle) {
    return splitCubic(from, from.outHandle, to.inHandle, to, t)
  }
  if (!from.outHandle && !to.inHandle) {
    return splitLine(from, to, t)
  }
  const control = from.outHandle ?? to.inHandle ?? from
  return splitQuadratic(from, control, to, t)
}

const perpendicularDistance = (point: Point, start: Point, end: Point): number => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < 1e-12) {
    return pointDistance(point, start)
  }
  const projection =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
  const closest = {
    x: start.x + Math.max(0, Math.min(1, projection)) * dx,
    y: start.y + Math.max(0, Math.min(1, projection)) * dy,
  }
  return pointDistance(point, closest)
}

const douglasPeucker = (points: Point[], tolerance: number): boolean[] => {
  const count = points.length
  if (count < 3 || tolerance <= 0) {
    return points.map(() => true)
  }
  const keep = new Array<boolean>(count).fill(false)
  keep[0] = true
  keep[count - 1] = true
  const stack: [number, number][] = [[0, count - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxDistance = 0
    let index = -1
    for (let i = first + 1; i < last; i += 1) {
      const distance = perpendicularDistance(points[i]!, points[first]!, points[last]!)
      if (distance > maxDistance) {
        maxDistance = distance
        index = i
      }
    }
    if (maxDistance > tolerance && index > 0) {
      keep[index] = true
      stack.push([first, index], [index, last])
    }
  }
  return keep
}

export const simplifySubpath = (subpath: PathSubpath, tolerance: number): PathSubpath => {
  const nodes = subpath.nodes
  if (nodes.length < 3) {
    return cloneSubpath(subpath)
  }

  if (!subpath.closed) {
    const keep = douglasPeucker(
      nodes.map((node) => ({ x: node.x, y: node.y })),
      tolerance,
    )
    return { closed: false, nodes: nodes.filter((_, index) => keep[index]) }
  }

  const centroid = nodes.reduce(
    (accumulator, node) => ({ x: accumulator.x + node.x, y: accumulator.y + node.y }),
    { x: 0, y: 0 },
  )
  centroid.x /= nodes.length
  centroid.y /= nodes.length

  let start = 0
  let bestDistance = -1
  nodes.forEach((node, index) => {
    const distance = pointDistance(node, centroid)
    if (distance > bestDistance) {
      bestDistance = distance
      start = index
    }
  })

  const rotated = [...nodes.slice(start), ...nodes.slice(0, start)]
  const anchors = rotated.map((node) => ({ x: node.x, y: node.y }))
  anchors.push({ ...anchors[0]! })
  const keep = douglasPeucker(anchors, tolerance)
  const kept = rotated.filter((_, index) => keep[index] && index < rotated.length)
  return { closed: true, nodes: kept }
}

export const simplifyPath = (model: PathModel, tolerance: number): PathModel => ({
  subpaths: model.subpaths.map((subpath) => simplifySubpath(subpath, tolerance)),
})

export const moveNode = (
  model: PathModel,
  subpathIndex: number,
  nodeIndex: number,
  position: Point,
): PathModel => {
  const subpath = model.subpaths[subpathIndex]
  const node = subpath?.nodes[nodeIndex]
  if (!subpath || !node) {
    return model
  }
  const result = clonePath(model)
  const target = result.subpaths[subpathIndex]!.nodes[nodeIndex]!
  target.x = position.x
  target.y = position.y
  return result
}

const extendAlong = (node: Point, handle: Point, length: number): Point => {
  const dx = node.x - handle.x
  const dy = node.y - handle.y
  const current = Math.hypot(dx, dy)
  if (current < 1e-9) {
    return { ...handle }
  }
  return { x: node.x + (dx / current) * length, y: node.y + (dy / current) * length }
}

export const computeNodeMode = (node: PathNode): HandleMode => {
  if (!node.inHandle || !node.outHandle) {
    return 'corner'
  }
  const incomingX = node.x - node.inHandle.x
  const incomingY = node.y - node.inHandle.y
  const outgoingX = node.outHandle.x - node.x
  const outgoingY = node.outHandle.y - node.y
  const incomingLength = Math.hypot(incomingX, incomingY)
  if (incomingLength < 1e-9) {
    return 'corner'
  }
  const mirrored = reflect(node.inHandle, node)
  if (pointEquals(mirrored, node.outHandle, 1e-3)) {
    return 'symmetric'
  }
  const cross = incomingX * outgoingY - incomingY * outgoingX
  const dot = incomingX * outgoingX + incomingY * outgoingY
  if (Math.abs(cross) <= 1e-6 * incomingLength && dot > 0) {
    return 'smooth'
  }
  return 'corner'
}

export const recomputeModes = (model: PathModel): PathModel => ({
  subpaths: model.subpaths.map((subpath) => ({
    closed: subpath.closed,
    nodes: subpath.nodes.map((node) => ({ ...node, mode: computeNodeMode(node) })),
  })),
})

export const moveHandle = (
  model: PathModel,
  subpathIndex: number,
  nodeIndex: number,
  kind: HandleKind,
  position: Point,
): PathModel => {
  const subpath = model.subpaths[subpathIndex]
  const node = subpath?.nodes[nodeIndex]
  if (!subpath || !node) {
    return model
  }
  const result = clonePath(model)
  const target = result.subpaths[subpathIndex]!.nodes[nodeIndex]!
  const counterpart = kind === 'in' ? target.outHandle : target.inHandle
  const counterpartLength = counterpart ? pointDistance(target, counterpart) : 0

  if (kind === 'in') {
    target.inHandle = { ...position }
  } else {
    target.outHandle = { ...position }
  }
  if (target.mode === 'corner' || !counterpartLength) {
    return result
  }
  if (target.mode === 'symmetric') {
    const mirrored = reflect(position, target)
    if (kind === 'in') {
      target.outHandle = { ...mirrored }
    } else {
      target.inHandle = { ...mirrored }
    }
    return result
  }
  const aligned = extendAlong(target, position, counterpartLength)
  if (kind === 'in') {
    target.outHandle = { ...aligned }
  } else {
    target.inHandle = { ...aligned }
  }
  return result
}

export const insertNode = (
  model: PathModel,
  subpathIndex: number,
  nodeIndex: number,
  position: Point,
): PathModel => {
  const subpath = model.subpaths[subpathIndex]
  if (!subpath || nodeIndex < 0 || nodeIndex > subpath.nodes.length) {
    return model
  }
  const result = clonePath(model)
  result.subpaths[subpathIndex]!.nodes.splice(nodeIndex, 0, makeNode(position.x, position.y))
  return result
}

export const deleteNode = (
  model: PathModel,
  subpathIndex: number,
  nodeIndex: number,
): PathModel => {
  const subpath = model.subpaths[subpathIndex]
  if (!subpath) {
    return model
  }
  const minimum = subpath.closed ? 3 : 2
  if (subpath.nodes.length - 1 < minimum) {
    return model
  }
  if (nodeIndex < 0 || nodeIndex >= subpath.nodes.length) {
    return model
  }
  const result = clonePath(model)
  result.subpaths[subpathIndex]!.nodes.splice(nodeIndex, 1)
  return result
}

export const splitSegmentCommand = (
  model: PathModel,
  subpathIndex: number,
  nodeIndex: number,
  t: number,
): PathModel => {
  const subpath = model.subpaths[subpathIndex]
  if (!subpath || nodeIndex < 0 || nodeIndex >= subpath.nodes.length - 1) {
    return model
  }
  const result = clonePath(model)
  const nodes = result.subpaths[subpathIndex]!.nodes
  const from = nodes[nodeIndex]!
  const to = nodes[nodeIndex + 1]!
  const split = splitSegment(from, to, t)

  if (split.leftCubic) {
    from.outHandle = { ...split.leftCubic.c1 }
  } else if (split.leftQuadratic) {
    from.outHandle = { ...split.leftQuadratic.c }
  } else {
    from.outHandle = null
  }

  const middle = makeNode(split.middle.x, split.middle.y)
  if (split.leftCubic) {
    middle.inHandle = { ...split.leftCubic.c2 }
    middle.outHandle = { ...split.rightCubic!.c1 }
  } else if (split.leftQuadratic) {
    middle.inHandle = { ...split.leftQuadratic.c }
    middle.outHandle = { ...split.rightQuadratic!.c }
  }

  if (split.rightCubic) {
    to.inHandle = { ...split.rightCubic.c2 }
  } else if (split.rightQuadratic) {
    to.inHandle = { ...split.rightQuadratic.c }
  } else {
    to.inHandle = null
  }

  nodes.splice(nodeIndex + 1, 0, middle)
  return result
}

export const reverseSubpath = (model: PathModel, subpathIndex: number): PathModel => {
  const subpath = model.subpaths[subpathIndex]
  if (!subpath) {
    return model
  }
  const result = clonePath(model)
  const nodes = result.subpaths[subpathIndex]!.nodes
  nodes.reverse()
  for (const node of nodes) {
    const previous = node.inHandle
    node.inHandle = node.outHandle
    node.outHandle = previous
  }
  return result
}

export const setClosed = (model: PathModel, subpathIndex: number, closed: boolean): PathModel => {
  const subpath = model.subpaths[subpathIndex]
  if (!subpath || subpath.closed === closed) {
    return model
  }
  if (!closed && subpath.nodes.length < 2) {
    return model
  }
  const result = clonePath(model)
  result.subpaths[subpathIndex]!.closed = closed
  return result
}

export const setNodeMode = (
  model: PathModel,
  subpathIndex: number,
  nodeIndex: number,
  mode: HandleMode,
): PathModel => {
  const node = model.subpaths[subpathIndex]?.nodes[nodeIndex]
  if (!node || node.mode === mode) {
    return model
  }
  const result = clonePath(model)
  const target = result.subpaths[subpathIndex]!.nodes[nodeIndex]!
  target.mode = mode

  if (mode === 'corner' || (!target.inHandle && !target.outHandle)) {
    return result
  }
  if (target.inHandle && !target.outHandle) {
    target.outHandle =
      mode === 'symmetric'
        ? reflect(target.inHandle, target)
        : extendAlong(target, target.inHandle, pointDistance(target, target.inHandle))
    return result
  }
  if (target.outHandle && !target.inHandle) {
    target.inHandle =
      mode === 'symmetric'
        ? reflect(target.outHandle, target)
        : extendAlong(target, target.outHandle, pointDistance(target, target.outHandle))
    return result
  }
  if (mode === 'symmetric') {
    target.outHandle = reflect(target.inHandle!, target)
  } else {
    target.outHandle = extendAlong(target, target.inHandle!, pointDistance(target, target.outHandle!))
  }
  return result
}

export const joinSubpaths = (model: PathModel, firstIndex: number, secondIndex: number): PathModel => {
  if (firstIndex === secondIndex) {
    return model
  }
  const first = model.subpaths[firstIndex]
  const second = model.subpaths[secondIndex]
  if (!first || !second || first.nodes.length === 0 || second.nodes.length === 0) {
    return model
  }

  const result = clonePath(model)
  const ordered = [Math.min(firstIndex, secondIndex), Math.max(firstIndex, secondIndex)]
  const head = result.subpaths[ordered[0]!]!
  const tail = result.subpaths[ordered[1]!]!

  const last = head.nodes.at(-1)!
  const firstTail = tail.nodes[0]!
  const merged = [...head.nodes]
  if (pointDistance(last, firstTail) > 1e-4) {
    merged.push(cloneNode(firstTail))
  }
  merged.push(...tail.nodes.slice(1).map(cloneNode))

  head.nodes = merged
  head.closed = tail.closed

  result.subpaths = result.subpaths.filter((_, index) => index !== ordered[0] && index !== ordered[1])
  result.subpaths.splice(ordered[0]!, 0, head)
  return result
}

export const splitSubpath = (model: PathModel, subpathIndex: number, nodeIndex: number): PathModel => {
  const subpath = model.subpaths[subpathIndex]
  if (!subpath || nodeIndex <= 0 || nodeIndex >= subpath.nodes.length) {
    return model
  }
  const result = clonePath(model)
  const nodes = result.subpaths[subpathIndex]!.nodes
  const boundary = cloneNode(nodes[nodeIndex]!)
  const firstPart: PathSubpath = { nodes: nodes.slice(0, nodeIndex + 1), closed: false }
  const secondPart: PathSubpath = { nodes: [boundary, ...nodes.slice(nodeIndex + 1).map(cloneNode)], closed: false }
  firstPart.nodes[nodeIndex] = boundary
  result.subpaths.splice(subpathIndex, 1, firstPart, secondPart)
  return result
}

export const transformPath = (model: PathModel, transform: AffineTransform): PathModel => {
  const apply = (point: Point): Point => ({
    x: transform.a * point.x + transform.c * point.y + transform.e,
    y: transform.b * point.x + transform.d * point.y + transform.f,
  })
  return {
    subpaths: model.subpaths.map((subpath) => ({
      closed: subpath.closed,
      nodes: subpath.nodes.map((node) => {
        const position = apply({ x: node.x, y: node.y })
        return {
          x: position.x,
          y: position.y,
          inHandle: node.inHandle ? apply(node.inHandle) : null,
          outHandle: node.outHandle ? apply(node.outHandle) : null,
          mode: node.mode,
        }
      }),
    })),
  }
}

export const translatePath = (model: PathModel, offset: Point): PathModel =>
  transformPath(model, { a: 1, b: 0, c: 0, d: 1, e: offset.x, f: offset.y })

export const segmentPointAt = (from: PathNode, to: PathNode, t: number): Point => {
  const kind = segmentKind(from, to)
  if (kind === 'cubic' && from.outHandle && to.inHandle) {
    const mt = 1 - t
    const a = { x: mt * from.x + t * from.outHandle.x, y: mt * from.y + t * from.outHandle.y }
    const b = { x: mt * from.outHandle.x + t * to.inHandle.x, y: mt * from.outHandle.y + t * to.inHandle.y }
    const c = { x: mt * to.inHandle.x + t * to.x, y: mt * to.inHandle.y + t * to.y }
    const d = { x: mt * a.x + t * b.x, y: mt * a.y + t * b.y }
    const e = { x: mt * b.x + t * c.x, y: mt * b.y + t * c.y }
    return { x: mt * d.x + t * e.x, y: mt * d.y + t * e.y }
  }
  if (kind === 'quadratic') {
    const control = from.outHandle ?? to.inHandle ?? from
    const mt = 1 - t
    return {
      x: mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x,
      y: mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y,
    }
  }
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

export const closestSegmentT = (from: PathNode, to: PathNode, point: Point): number => {
  if (segmentKind(from, to) === 'line') {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared < 1e-12) {
      return 0
    }
    return Math.max(
      0,
      Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
    )
  }

  let bestT = 0
  let bestDistance = Number.POSITIVE_INFINITY
  const steps = 24
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const distance = pointDistance(segmentPointAt(from, to, t), point)
    if (distance < bestDistance) {
      bestDistance = distance
      bestT = t
    }
  }

  let low = Math.max(0, bestT - 1 / steps)
  let high = Math.min(1, bestT + 1 / steps)
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const third = (high - low) / 3
    const t1 = low + third
    const t2 = high - third
    const d1 = pointDistance(segmentPointAt(from, to, t1), point)
    const d2 = pointDistance(segmentPointAt(from, to, t2), point)
    if (d1 < d2) {
      high = t2
    } else {
      low = t1
    }
  }
  return (low + high) / 2
}
