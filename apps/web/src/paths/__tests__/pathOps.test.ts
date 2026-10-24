import { describe, expect, it } from 'vitest'
import {
  closestSegmentT,
  computeNodeMode,
  deleteNode,
  insertNode,
  joinSubpaths,
  moveHandle,
  moveNode,
  reverseSubpath,
  segmentPointAt,
  setClosed,
  setNodeMode,
  simplifyPath,
  splitSegmentCommand,
  splitSubpath,
  translatePath,
} from '../ops'
import { makeNode, pointDistance } from '../model'
import { parsePathData, serializePathModel } from '../parser'
import { createPolygonPath, createStarPath } from '../shapes'

const modelOf = (data: string) => parsePathData(data)

describe('node editing', () => {
  it('moves a node', () => {
    const model = moveNode(modelOf('M 0 0 L 10 0 L 10 10'), 0, 1, { x: 5, y: 5 })
    expect(model.subpaths[0]!.nodes[1]).toMatchObject({ x: 5, y: 5 })
  })

  it('does not mutate the source model', () => {
    const source = modelOf('M 0 0 L 10 0')
    moveNode(source, 0, 1, { x: 4, y: 4 })
    expect(source.subpaths[0]!.nodes[1]).toMatchObject({ x: 10, y: 0 })
  })

  it('mirrors handles for symmetric nodes', () => {
    const source = modelOf('M 0 0 C 10 10 20 10 30 0 L 60 0')
    const model = setNodeMode(source, 0, 1, 'symmetric')
    const moved = moveHandle(model, 0, 1, 'out', { x: 40, y: 5 })
    const node = moved.subpaths[0]!.nodes[1]!
    expect(node.outHandle).toEqual({ x: 40, y: 5 })
    expect(node.inHandle).toEqual({ x: 20, y: -5 })
  })

  it('keeps handle lengths independent for smooth nodes', () => {
    const source = modelOf('M 0 0 C 10 10 20 10 30 0 C 50 20 45 30 60 0')
    const model = setNodeMode(source, 0, 1, 'smooth')
    const moved = moveHandle(model, 0, 1, 'out', { x: 40, y: 5 })
    const node = moved.subpaths[0]!.nodes[1]!
    expect(node.outHandle).toEqual({ x: 40, y: 5 })
    expect(computeNodeMode(node)).toBe('smooth')
    expect(pointDistance(node, node.inHandle!)).not.toBeCloseTo(
      pointDistance(node, node.outHandle!),
      5,
    )
  })

  it('round-trips the node mode through serialization', () => {
    const source = modelOf('M 0 0 C 10 10 20 10 30 0 C 50 20 45 30 60 0')
    const smooth = setNodeMode(source, 0, 1, 'smooth')
    const parsedSmooth = parsePathData(serializePathModel(smooth)).subpaths[0]!.nodes[1]!
    expect(computeNodeMode(parsedSmooth)).toBe('smooth')

    const symmetric = setNodeMode(source, 0, 1, 'symmetric')
    const parsedSymmetric = parsePathData(serializePathModel(symmetric)).subpaths[0]!.nodes[1]!
    expect(computeNodeMode(parsedSymmetric)).toBe('symmetric')
  })

  it('keeps handles independent for corner nodes', () => {
    const model = moveHandle(modelOf('M 0 0 C 10 10 20 10 30 0'), 0, 1, 'out', { x: 40, y: 5 })
    const node = model.subpaths[0]!.nodes[1]!
    expect(node.outHandle).toEqual({ x: 40, y: 5 })
    expect(node.inHandle).toEqual({ x: 20, y: 10 })
  })

  it('inserts a node', () => {
    const model = insertNode(modelOf('M 0 0 L 10 0'), 0, 1, { x: 5, y: 0 })
    expect(model.subpaths[0]!.nodes).toHaveLength(3)
    expect(model.subpaths[0]!.nodes[1]).toMatchObject({ x: 5, y: 0 })
  })

  it('deletes a node and guards the minimum', () => {
    const trimmed = deleteNode(modelOf('M 0 0 L 5 0 L 10 0'), 0, 1)
    expect(trimmed.subpaths[0]!.nodes).toHaveLength(2)
    const guarded = deleteNode(modelOf('M 0 0 L 10 0'), 0, 1)
    expect(guarded.subpaths[0]!.nodes).toHaveLength(2)
  })

  it('keeps closed subpaths degenerate-free', () => {
    const model = deleteNode(modelOf('M 0 0 L 10 0 L 10 10 Z'), 0, 1)
    expect(model.subpaths[0]!.nodes).toHaveLength(3)
  })
})

describe('segment splitting', () => {
  it('splits a cubic at the midpoint', () => {
    const model = splitSegmentCommand(modelOf('M 0 0 C 0 10 100 10 100 0'), 0, 0, 0.5)
    const nodes = model.subpaths[0]!.nodes
    expect(nodes).toHaveLength(3)
    expect(nodes[1]).toMatchObject({ x: 50, y: 7.5 })
    expect(serializePathModel(model)).toBe('M 0 0 C 0 5 25 7.5 50 7.5 C 75 7.5 100 5 100 0')
  })

  it('splits a straight segment', () => {
    const model = splitSegmentCommand(modelOf('M 0 0 L 100 0'), 0, 0, 0.5)
    expect(model.subpaths[0]!.nodes[1]).toMatchObject({ x: 50, y: 0 })
  })

  it('samples points along a segment', () => {
    expect(segmentPointAt(makeNode(0, 0), makeNode(10, 0), 0.5)).toEqual({ x: 5, y: 0 })
    const cubicFrom = makeNode(0, 0, null, { x: 0, y: 10 })
    const cubicTo = makeNode(100, 0, { x: 100, y: 10 }, null)
    expect(segmentPointAt(cubicFrom, cubicTo, 0.5)).toMatchObject({ x: 50, y: 7.5 })
  })

  it('finds the closest parameter on a line', () => {
    const from = makeNode(0, 0)
    const to = makeNode(100, 0)
    expect(closestSegmentT(from, to, { x: 25, y: 20 })).toBeCloseTo(0.25, 5)
    expect(closestSegmentT(from, to, { x: 200, y: 20 })).toBe(1)
  })
})

describe('subpath operations', () => {
  it('reverses a subpath and swaps handles', () => {
    const model = reverseSubpath(modelOf('M 0 0 C 10 10 20 10 30 0'), 0)
    const nodes = model.subpaths[0]!.nodes
    expect(nodes[0]).toMatchObject({ x: 30, y: 0 })
    expect(nodes[0]!.outHandle).toEqual({ x: 20, y: 10 })
    expect(nodes[1]).toMatchObject({ x: 0, y: 0 })
    expect(nodes[1]!.inHandle).toEqual({ x: 10, y: 10 })
    expect(serializePathModel(model)).toBe('M 30 0 C 20 10 10 10 0 0')
  })

  it('opens and closes subpaths', () => {
    const closed = setClosed(modelOf('M 0 0 L 10 0'), 0, true)
    expect(closed.subpaths[0]!.closed).toBe(true)
    expect(serializePathModel(closed)).toBe('M 0 0 L 10 0 Z')
    const reopened = setClosed(closed, 0, false)
    expect(reopened.subpaths[0]!.closed).toBe(false)
  })

  it('joins two subpaths', () => {
    const model = joinSubpaths(modelOf('M 0 0 L 10 0 M 20 0 L 30 0'), 0, 1)
    expect(model.subpaths).toHaveLength(1)
    expect(model.subpaths[0]!.nodes.map((node) => node.x)).toEqual([0, 10, 20, 30])
  })

  it('splits a subpath at a node boundary', () => {
    const model = splitSubpath(modelOf('M 0 0 L 10 0 L 20 0'), 0, 1)
    expect(model.subpaths).toHaveLength(2)
    expect(model.subpaths[0]!.nodes).toHaveLength(2)
    expect(model.subpaths[1]!.nodes).toHaveLength(2)
    expect(model.subpaths[0]!.closed).toBe(false)
  })

  it('translates every node and handle', () => {
    const model = translatePath(modelOf('M 0 0 C 10 10 20 10 30 0'), { x: 5, y: -5 })
    const nodes = model.subpaths[0]!.nodes
    expect(nodes[0]).toMatchObject({ x: 5, y: -5 })
    expect(nodes[0]!.outHandle).toEqual({ x: 15, y: 5 })
    expect(nodes[1]!.inHandle).toEqual({ x: 25, y: 5 })
  })
})

describe('simplification', () => {
  it('drops collinear nodes', () => {
    const model = simplifyPath(modelOf('M 0 0 L 1 0 L 2 0 L 3 0 L 4 0'), 0.5)
    expect(model.subpaths[0]!.nodes).toHaveLength(2)
  })

  it('keeps every node at zero tolerance', () => {
    const model = simplifyPath(modelOf('M 0 0 L 1 0 L 2 0 L 3 0 L 4 0'), 0)
    expect(model.subpaths[0]!.nodes).toHaveLength(5)
  })

  it('preserves corners', () => {
    const model = simplifyPath(modelOf('M 0 0 L 10 0 L 10 10 L 0 10 Z'), 4)
    expect(model.subpaths[0]!.nodes).toHaveLength(4)
    expect(model.subpaths[0]!.closed).toBe(true)
  })
})

describe('shape generators', () => {
  it('builds a line', () => {
    const model = createPolygonPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
    expect(serializePathModel(model)).toBe('M 0 0 L 10 0 L 10 10 Z')
  })

  it('builds a star with alternating radii', () => {
    const model = createStarPath({ x: 0, y: 0 }, 10, 4, 5)
    const nodes = model.subpaths[0]!.nodes
    expect(nodes).toHaveLength(10)
    expect(Math.hypot(nodes[0]!.x, nodes[0]!.y)).toBeCloseTo(10, 5)
    expect(Math.hypot(nodes[1]!.x, nodes[1]!.y)).toBeCloseTo(4, 5)
  })

  it('builds a smooth polygon with handles', () => {
    const model = createPolygonPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      true,
    )
    const nodes = model.subpaths[0]!.nodes
    expect(nodes[0]!.outHandle).toBeTruthy()
    expect(nodes[0]!.inHandle).toBeTruthy()
  })
})
