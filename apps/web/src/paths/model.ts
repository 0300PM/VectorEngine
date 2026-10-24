export interface Point {
  x: number
  y: number
}

export type HandleMode = 'corner' | 'smooth' | 'symmetric'

export type HandleKind = 'in' | 'out'

export interface AffineTransform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface PathNode {
  x: number
  y: number
  inHandle: Point | null
  outHandle: Point | null
  mode: HandleMode
}

export interface PathSubpath {
  nodes: PathNode[]
  closed: boolean
}

export interface PathModel {
  subpaths: PathSubpath[]
}

export const EMPTY_PATH: PathModel = { subpaths: [] }

export const pointEquals = (a: Point, b: Point, epsilon = 1e-6): boolean =>
  Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon

export const pointDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export const reflect = (handle: Point, anchor: Point): Point => ({
  x: anchor.x * 2 - handle.x,
  y: anchor.y * 2 - handle.y,
})

export const translate = (point: Point, dx: number, dy: number): Point => ({
  x: point.x + dx,
  y: point.y + dy,
})

export const clonePath = (model: PathModel): PathModel => ({
  subpaths: model.subpaths.map((subpath) => ({
    closed: subpath.closed,
    nodes: subpath.nodes.map((node) => ({
      x: node.x,
      y: node.y,
      inHandle: node.inHandle ? { ...node.inHandle } : null,
      outHandle: node.outHandle ? { ...node.outHandle } : null,
      mode: node.mode,
    })),
  })),
})

export const flattenNodes = (model: PathModel): PathNode[] =>
  model.subpaths.flatMap((subpath) => subpath.nodes)

export const totalNodeCount = (model: PathModel): number =>
  model.subpaths.reduce((sum, subpath) => sum + subpath.nodes.length, 0)

export const isClosed = (model: PathModel): boolean =>
  model.subpaths.length > 0 && model.subpaths.every((subpath) => subpath.closed)

export const makeNode = (
  x: number,
  y: number,
  inHandle: Point | null = null,
  outHandle: Point | null = null,
  mode: HandleMode = 'corner',
): PathNode => ({ x, y, inHandle, outHandle, mode })
