import { recomputeModes } from './ops'
import {
  makeNode,
  pointEquals,
  reflect,
  type PathModel,
  type PathNode,
  type PathSubpath,
  type Point,
} from './model'

const tokenPattern = /[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g
const isCommandToken = (token: string): boolean => /^[MmLlHhVvCcSsQqTtAaZz]$/.test(token)

const parameterCount: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
}

export const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0'
  }
  if (Object.is(value, -0) || Math.abs(value) < 1e-12) {
    return '0'
  }
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return String(value)
  }
  return String(Number(value.toFixed(4)))
}

const formatPoint = (point: Point): string => `${formatNumber(point.x)} ${formatNumber(point.y)}`

interface ArcParameters {
  cx: number
  cy: number
  theta1: number
  dTheta: number
  rx: number
  ry: number
  phi: number
}

const arcParameters = (
  x1: number,
  y1: number,
  rxInput: number,
  ryInput: number,
  phi: number,
  x2: number,
  y2: number,
  largeArc: number,
  sweep: number,
): ArcParameters => {
  const rx = Math.abs(rxInput)
  const ry = Math.abs(ryInput)
  if (rx === 0 || ry === 0) {
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, theta1: 0, dTheta: 0, rx: 0, ry: 0, phi: 0 }
  }

  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cosPhi * dx + sinPhi * dy
  const y1p = -sinPhi * dx + cosPhi * dy

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  let rrx = rx
  let rry = ry
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rrx *= scale
    rry *= scale
  }

  const num = rrx * rrx * rry * rry - rrx * rrx * y1p * y1p - rry * rry * x1p * x1p
  const den = rrx * rrx * y1p * y1p + rry * rry * x1p * x1p
  const coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den)) * (largeArc === sweep ? -1 : 1)
  const cxp = coef * rrx * y1p / rry
  const cyp = -coef * rry * x1p / rrx

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2
  const theta1 = Math.atan2((y1p - cyp) / rry, (x1p - cxp) / rrx)
  let dTheta = Math.atan2((-y1p - cyp) / rry, (-x1p - cxp) / rrx) - theta1
  if (!sweep && dTheta > 0) {
    dTheta -= 2 * Math.PI
  }
  if (sweep && dTheta < 0) {
    dTheta += 2 * Math.PI
  }

  return { cx, cy, theta1, dTheta, rx: rrx, ry: rry, phi }
}

const sampleArc = (params: ArcParameters, steps: number): Point[] => {
  const cosPhi = Math.cos(params.phi)
  const sinPhi = Math.sin(params.phi)
  const points: Point[] = []
  for (let step = 0; step <= steps; step += 1) {
    const theta = params.theta1 + (params.dTheta * step) / steps
    const localX = params.rx * Math.cos(theta)
    const localY = params.ry * Math.sin(theta)
    points.push({
      x: params.cx + cosPhi * localX - sinPhi * localY,
      y: params.cy + sinPhi * localX + cosPhi * localY,
    })
  }
  return points
}

const catmullRomSegments = (
  points: Point[],
): { c1: Point; c2: Point; end: Point }[] => {
  if (points.length < 2) {
    return []
  }
  const padded = [points[0]!, ...points, points[points.length - 1]!]
  const segments: { c1: Point; c2: Point; end: Point }[] = []
  for (let i = 1; i < padded.length - 2; i += 1) {
    const p0 = padded[i - 1]!
    const p1 = padded[i]!
    const p2 = padded[i + 1]!
    const p3 = padded[i + 2]!
    segments.push({
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      end: p2,
    })
  }
  return segments
}

class PathBuilder {
  subpaths: PathSubpath[] = []

  private current: PathSubpath | null = null

  private cursor: Point = { x: 0, y: 0 }

  private lastControl: Point | null = null

  private lastCubic: { c1: Point; c2: Point } | null = null

  get cursorPoint(): Point {
    return { ...this.cursor }
  }

  get lastControlPoint(): Point | null {
    return this.lastControl
  }

  get lastCubicControl(): { c1: Point; c2: Point } | null {
    return this.lastCubic
  }

  startSubpath(x: number, y: number): void {
    this.current = { nodes: [makeNode(x, y)], closed: false }
    this.subpaths.push(this.current)
    this.cursor = { x, y }
    this.lastControl = null
    this.lastCubic = null
  }

  private lastNode(): PathNode | undefined {
    return this.current?.nodes.at(-1)
  }

  addLine(x: number, y: number): void {
    this.current?.nodes.push(makeNode(x, y))
    this.cursor = { x, y }
    this.lastControl = null
    this.lastCubic = null
  }

  addQuadratic(control: Point, end: Point): void {
    const previous = this.lastNode()
    if (previous) {
      previous.outHandle = { ...control }
    }
    this.current?.nodes.push(makeNode(end.x, end.y, { ...control }))
    this.cursor = { ...end }
    this.lastControl = { ...control }
    this.lastCubic = null
  }

  addCubic(c1: Point, c2: Point, end: Point): void {
    const previous = this.lastNode()
    if (previous) {
      previous.outHandle = { ...c1 }
    }
    this.current?.nodes.push(makeNode(end.x, end.y, { ...c2 }))
    this.cursor = { ...end }
    this.lastControl = { ...c2 }
    this.lastCubic = { c1: { ...c1 }, c2: { ...c2 } }
  }

  addArc(
    rx: number,
    ry: number,
    phi: number,
    end: Point,
    largeArc: number,
    sweep: number,
  ): void {
    if (rx === 0 || ry === 0) {
      this.addLine(end.x, end.y)
      return
    }
    const params = arcParameters(
      this.cursor.x,
      this.cursor.y,
      rx,
      ry,
      phi,
      end.x,
      end.y,
      largeArc,
      sweep,
    )
    const steps = Math.max(8, Math.ceil(Math.abs(params.dTheta) / (Math.PI / 8)))
    const points = sampleArc(params, steps)
    for (const segment of catmullRomSegments(points)) {
      this.addCubic(segment.c1, segment.c2, segment.end)
    }
    this.cursor = { ...end }
  }

  close(): void {
    if (!this.current || this.current.nodes.length < 2) {
      return
    }
    this.current.closed = true
    this.lastControl = null
    this.lastCubic = null
  }
}

export const parsePathData = (data: string): PathModel => {
  const tokens = data.match(tokenPattern) ?? []
  const builder = new PathBuilder()
  let index = 0
  let command = ''

  while (index < tokens.length) {
    const token = tokens[index]
    if (!token) {
      break
    }
    if (isCommandToken(token)) {
      command = token
      index += 1
    } else if (!command) {
      break
    }

    const upper = command.toUpperCase()
    const relative = command !== upper
    const count = parameterCount[upper] ?? 0

    if (upper === 'Z') {
      builder.close()
      command = ''
      continue
    }
    if (index + count > tokens.length) {
      break
    }

    const values = tokens.slice(index, index + count).map((value) => Number(value))
    if (values.some((value) => !Number.isFinite(value))) {
      break
    }
    index += count

    const offsetX = (value: number): number => (relative ? builder.cursorPoint.x + value : value)
    const offsetY = (value: number): number => (relative ? builder.cursorPoint.y + value : value)

    switch (upper) {
      case 'M': {
        builder.startSubpath(offsetX(values[0]!), offsetY(values[1]!))
        command = relative ? 'l' : 'L'
        break
      }
      case 'L':
        builder.addLine(offsetX(values[0]!), offsetY(values[1]!))
        break
      case 'H':
        builder.addLine(offsetX(values[0]!), builder.cursorPoint.y)
        break
      case 'V':
        builder.addLine(builder.cursorPoint.x, offsetY(values[0]!))
        break
      case 'C':
        builder.addCubic(
          { x: offsetX(values[0]!), y: offsetY(values[1]!) },
          { x: offsetX(values[2]!), y: offsetY(values[3]!) },
          { x: offsetX(values[4]!), y: offsetY(values[5]!) },
        )
        break
      case 'S': {
        const c1 = builder.lastCubicControl
          ? reflect(builder.lastCubicControl.c2, builder.cursorPoint)
          : { ...builder.cursorPoint }
        builder.addCubic(
          c1,
          { x: offsetX(values[0]!), y: offsetY(values[1]!) },
          { x: offsetX(values[2]!), y: offsetY(values[3]!) },
        )
        break
      }
      case 'Q':
        builder.addQuadratic(
          { x: offsetX(values[0]!), y: offsetY(values[1]!) },
          { x: offsetX(values[2]!), y: offsetY(values[3]!) },
        )
        break
      case 'T': {
        const control = builder.lastControlPoint
          ? reflect(builder.lastControlPoint, builder.cursorPoint)
          : { ...builder.cursorPoint }
        builder.addQuadratic(control, { x: offsetX(values[0]!), y: offsetY(values[1]!) })
        break
      }
      case 'A': {
        const rx = values[0]!
        const ry = values[1]!
        const phi = (values[2]! * Math.PI) / 180
        const largeArc = values[3]!
        const sweep = values[4]!
        builder.addArc(rx, ry, phi, { x: offsetX(values[5]!), y: offsetY(values[6]!) }, largeArc, sweep)
        break
      }
      default:
        break
    }
  }

  return recomputeModes({ subpaths: builder.subpaths })
}

export const serializePathModel = (model: PathModel): string => {
  const parts: string[] = []
  for (const subpath of model.subpaths) {
    if (subpath.nodes.length === 0) {
      continue
    }
    const first = subpath.nodes[0]!
    parts.push(`M ${formatPoint(first)}`)
    let previous = first
    for (let index = 1; index < subpath.nodes.length; index += 1) {
      const node = subpath.nodes[index]!
      const out = previous.outHandle
      const incoming = node.inHandle
      if (out && incoming) {
        if (pointEquals(out, incoming, 1e-4)) {
          parts.push(`Q ${formatPoint(out)} ${formatPoint(node)}`)
        } else {
          parts.push(
            `C ${formatPoint(out)} ${formatPoint(incoming)} ${formatPoint(node)}`,
          )
        }
      } else if (out) {
        parts.push(`Q ${formatPoint(out)} ${formatPoint(node)}`)
      } else if (incoming) {
        parts.push(`Q ${formatPoint(incoming)} ${formatPoint(node)}`)
      } else {
        parts.push(`L ${formatPoint(node)}`)
      }
      previous = node
    }
    if (subpath.closed) {
      parts.push('Z')
    }
  }
  return parts.join(' ')
}
