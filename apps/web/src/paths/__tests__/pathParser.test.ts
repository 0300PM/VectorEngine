import { describe, expect, it } from 'vitest'
import { isValidPathData } from '@/engine/pathValidator'
import { parsePathData, serializePathModel } from '../parser'

const roundTrip = (data: string): string => serializePathModel(parsePathData(data))

describe('path parser', () => {
  it('parses a line segment', () => {
    const model = parsePathData('M 10 20 L 110 120')
    expect(model.subpaths).toHaveLength(1)
    expect(model.subpaths[0]!.nodes).toHaveLength(2)
    expect(model.subpaths[0]!.nodes[0]).toMatchObject({ x: 10, y: 20 })
    expect(model.subpaths[0]!.nodes[1]).toMatchObject({ x: 110, y: 120 })
    expect(model.subpaths[0]!.closed).toBe(false)
  })

  it('parses relative and absolute moves into separate subpaths', () => {
    const model = parsePathData('M 0 0 L 50 0 m -50 50 L 50 50')
    expect(model.subpaths).toHaveLength(2)
    expect(model.subpaths[1]!.nodes[0]).toMatchObject({ x: 0, y: 50 })
    expect(model.subpaths[1]!.nodes[1]).toMatchObject({ x: 50, y: 50 })
  })

  it('parses horizontal and vertical segments', () => {
    const model = parsePathData('M 0 0 H 50 V 30')
    const nodes = model.subpaths[0]!.nodes
    expect(nodes.map((node) => [node.x, node.y])).toEqual([
      [0, 0],
      [50, 0],
      [50, 30],
    ])
  })

  it('parses a closed polygon', () => {
    const model = parsePathData('M 0 0 L 100 0 L 100 100 L 0 100 Z')
    expect(model.subpaths[0]!.closed).toBe(true)
    expect(model.subpaths[0]!.nodes).toHaveLength(4)
  })

  it('parses cubic curves and keeps both handles', () => {
    const model = parsePathData('M 0 0 C 10 20 30 40 50 50')
    const nodes = model.subpaths[0]!.nodes
    expect(nodes[0]!.outHandle).toEqual({ x: 10, y: 20 })
    expect(nodes[1]!.inHandle).toEqual({ x: 30, y: 40 })
    expect(nodes[1]).toMatchObject({ x: 50, y: 50 })
  })

  it('parses smooth cubic continuation', () => {
    const model = parsePathData('M 0 0 C 10 0 20 0 30 0 S 50 0 60 0')
    const nodes = model.subpaths[0]!.nodes
    expect(nodes[1]!.outHandle).toEqual({ x: 40, y: 0 })
    expect(nodes[2]!.inHandle).toEqual({ x: 50, y: 0 })
  })

  it('parses quadratic curves', () => {
    const model = parsePathData('M 0 0 Q 20 40 40 0')
    const nodes = model.subpaths[0]!.nodes
    expect(nodes[0]!.outHandle).toEqual({ x: 20, y: 40 })
    expect(nodes[1]!.inHandle).toEqual({ x: 20, y: 40 })
  })

  it('converts arcs into cubic segments', () => {
    const model = parsePathData('M 100 0 A 100 100 0 0 1 0 0')
    const nodes = model.subpaths[0]!.nodes
    expect(nodes.length).toBeGreaterThan(4)
    expect(nodes[0]).toMatchObject({ x: 100, y: 0 })
    const last = nodes.at(-1)!
    expect(Math.abs(last.x)).toBeLessThan(1e-6)
    expect(Math.abs(last.y)).toBeLessThan(1e-6)
  })

  it('ignores degenerate arcs', () => {
    const model = parsePathData('M 0 0 A 0 0 0 0 0 10 10')
    expect(model.subpaths[0]!.nodes[1]).toMatchObject({ x: 10, y: 10 })
  })

  it('parses path data with commas and newlines', () => {
    const model = parsePathData('M0,0\nL100,0\nL100,100\nL0,100\nZ')
    expect(model.subpaths[0]!.nodes).toHaveLength(4)
  })

  it('rejects input without a leading move', () => {
    expect(parsePathData('L 10 10').subpaths).toHaveLength(0)
  })

  it('stops parsing when parameters run out', () => {
    expect(parsePathData('M 0 0 L 10').subpaths[0]!.nodes).toHaveLength(1)
  })
})

describe('path serializer', () => {
  it('round-trips lines', () => {
    const data = roundTrip('M 0 0 L 100 0 L 100 100 Z')
    expect(data).toBe('M 0 0 L 100 0 L 100 100 Z')
  })

  it('round-trips cubic curves', () => {
    const data = roundTrip('M 0 0 C 10 20 30 40 50 50')
    expect(data).toBe('M 0 0 C 10 20 30 40 50 50')
  })

  it('round-trips quadratic curves', () => {
    const data = roundTrip('M 0 0 Q 20 40 40 0')
    expect(data).toBe('M 0 0 Q 20 40 40 0')
  })

  it('emits closed markers', () => {
    expect(roundTrip('M 0 0 L 10 0 Z')).toBe('M 0 0 L 10 0 Z')
  })

  it('produces data that passes the scene validator', () => {
    const samples = [
      'M 0 0 L 100 0 Z',
      'M 0 0 C 10 20 30 40 50 50 L 60 70',
      'M 0 0 Q 20 40 40 0 T 80 0',
      'M 0 0 H 50 V 50 Z',
      'M 100 0 A 100 100 0 0 1 0 0 L 10 10',
      'M 0 0 c 1 2 3 4 5 6 s 7 8 9 10',
    ]
    for (const sample of samples) {
      expect(isValidPathData(roundTrip(sample)), sample).toBe(true)
    }
  })

  it('keeps numbers tidy', () => {
    const data = roundTrip('M 0 0 L 12.5 30.123456789 Z')
    expect(data).toBe('M 0 0 L 12.5 30.1235 Z')
  })
})
