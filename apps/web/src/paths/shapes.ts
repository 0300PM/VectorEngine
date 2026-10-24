import { makeNode, type PathModel, type PathNode, type PathSubpath, type Point } from './model'

const catmullRomHandles = (
  points: Point[],
): { c1: Point; c2: Point }[] => {
  if (points.length < 2) {
    return []
  }
  const padded = [points[0]!, ...points, points[points.length - 1]!]
  const handles: { c1: Point; c2: Point }[] = []
  for (let i = 1; i < padded.length - 2; i += 1) {
    const p0 = padded[i - 1]!
    const p1 = padded[i]!
    const p2 = padded[i + 1]!
    const p3 = padded[i + 2]!
    handles.push({
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
    })
  }
  return handles
}

const smoothSubpath = (points: Point[], closed: boolean): PathSubpath => {
  if (points.length < 3) {
    return { nodes: points.map((point) => makeNode(point.x, point.y)), closed }
  }
  const ring = closed ? [...points, points[0]!] : points
  const handles = catmullRomHandles(ring)
  const count = points.length
  const nodes: PathNode[] = []
  for (let index = 0; index < count; index += 1) {
    const node = makeNode(points[index]!.x, points[index]!.y)
    const incoming = closed ? handles[(index - 1 + count) % count] : handles[index - 1]
    const outgoing = handles[index]
    if (incoming) {
      node.inHandle = incoming.c2
    }
    if (outgoing) {
      node.outHandle = outgoing.c1
    }
    nodes.push(node)
  }
  return { nodes, closed }
}

const straightSubpath = (points: Point[], closed: boolean): PathSubpath => ({
  nodes: points.map((point) => makeNode(point.x, point.y)),
  closed,
})

export const createLinePath = (start: Point, end: Point): PathModel => ({
  subpaths: [straightSubpath([start, end], false)],
})

export const createPolylinePath = (points: Point[], smooth = false): PathModel => {
  if (points.length < 2) {
    return { subpaths: [] }
  }
  return {
    subpaths: [smooth ? smoothSubpath(points, false) : straightSubpath(points, false)],
  }
}

export const createPolygonPath = (points: Point[], smooth = false): PathModel => {
  if (points.length < 3) {
    return { subpaths: [] }
  }
  return {
    subpaths: [smooth ? smoothSubpath(points, true) : straightSubpath(points, true)],
  }
}

export const createRectanglePath = (
  x: number,
  y: number,
  width: number,
  height: number,
): PathModel =>
  createPolygonPath([
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ])

export const createStarPath = (
  center: Point,
  outerRadius: number,
  innerRadius: number,
  spikes: number,
  rotation = 0,
): PathModel => {
  const vertices: Point[] = []
  const step = Math.PI / spikes
  for (let index = 0; index < spikes * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius
    const angle = rotation + index * step - Math.PI / 2
    vertices.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    })
  }
  return createPolygonPath(vertices)
}

export const createArcPath = (
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  counterclockwise = false,
): PathModel => {
  let delta = endAngle - startAngle
  if (!counterclockwise && delta < 0) {
    delta += 2 * Math.PI
  }
  if (counterclockwise && delta > 0) {
    delta -= 2 * Math.PI
  }
  const segments = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 8)))
  const points: Point[] = []
  for (let step = 0; step <= segments; step += 1) {
    const angle = startAngle + (delta * step) / segments
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    })
  }
  return createPolylinePath(points, true)
}
