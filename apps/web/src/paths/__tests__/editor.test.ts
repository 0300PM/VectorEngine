import { describe, expect, it } from 'vitest'
import { isValidPathData } from '@/engine/pathValidator'
import {
  applyPathCommand,
  buildBooleanObject,
  createPathObject,
  nextObjectId,
  parsePathObject,
  serializePath,
} from '../editor'
import { parsePathData } from '../parser'
import { createPolygonPath, createRectanglePath } from '../shapes'
import type { VectorScene } from '@/types/scene'

const sceneOf = (): VectorScene => JSON.parse(JSON.stringify({
  version: '1.0',
  document: { width: 100, height: 100 },
  objects: [
    { id: 'first', type: 'path', d: 'M 0 0 L 10 0 Z' },
    { id: 'second', type: 'rect', x: 0, y: 0, width: 10, height: 10 },
  ],
})) as VectorScene

describe('path commands', () => {
  it('applies a move-node command', () => {
    const model = applyPathCommand(parsePathData('M 0 0 L 10 0'), {
      kind: 'move-node',
      subpath: 0,
      node: 1,
      position: { x: 4, y: 6 },
    })
    expect(model.subpaths[0]!.nodes[1]).toMatchObject({ x: 4, y: 6 })
  })

  it('applies a toggle-closed command', () => {
    const open = applyPathCommand(parsePathData('M 0 0 L 10 0'), { kind: 'toggle-closed', subpath: 0 })
    expect(open.subpaths[0]!.closed).toBe(true)
    const closed = applyPathCommand(open, { kind: 'toggle-closed', subpath: 0 })
    expect(closed.subpaths[0]!.closed).toBe(false)
  })

  it('applies simplify with the given tolerance', () => {
    const model = applyPathCommand(parsePathData('M 0 0 L 1 0 L 2 0 L 3 0'), {
      kind: 'simplify',
      tolerance: 0.5,
    })
    expect(model.subpaths[0]!.nodes).toHaveLength(2)
  })

  it('leaves the model untouched for unknown targets', () => {
    const model = parsePathData('M 0 0 L 10 0')
    const result = applyPathCommand(model, {
      kind: 'move-node',
      subpath: 5,
      node: 0,
      position: { x: 1, y: 1 },
    })
    expect(result).toBe(model)
  })
})

describe('path objects', () => {
  it('parses a path object back into a model', () => {
    const object = { id: 'a', type: 'path' as const, d: 'M 0 0 C 1 1 2 2 3 3' }
    const model = parsePathObject(object)
    expect(model?.subpaths[0]!.nodes).toHaveLength(2)
  })

  it('ignores non-path objects', () => {
    expect(parsePathObject({ id: 'a', type: 'rect', x: 0, y: 0, width: 1, height: 1 })).toBeNull()
  })

  it('creates serialisable path objects', () => {
    const object = createPathObject(createPolygonPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]), {
      id: 'shape',
      name: 'Triangle',
    })
    expect(object.type).toBe('path')
    expect(object.name).toBe('Triangle')
    expect(isValidPathData(object.d)).toBe(true)
  })

  it('round-trips through serializePath', () => {
    const model = parsePathData('M 0 0 Q 5 10 10 0')
    expect(serializePath(parsePathData(serializePath(model)))).toBe(serializePath(model))
  })
})

describe('boolean objects', () => {
  it('builds a union object', () => {
    const outcome = buildBooleanObject(
      createRectanglePath(0, 0, 100, 100),
      createRectanglePath(50, 50, 100, 100),
      'union',
      { id: 'union-1', name: 'Union' },
    )
    expect(outcome.reason).toBe('')
    expect(outcome.object?.type).toBe('path')
    expect(isValidPathData(outcome.object!.d)).toBe(true)
  })

  it('reports a reason for open shapes', () => {
    const open = createPolygonPath([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    const outcome = buildBooleanObject(open, createRectanglePath(0, 0, 10, 10), 'subtract', {
      id: 'sub-1',
      name: 'Subtract',
    })
    expect(outcome.object).toBeNull()
    expect(outcome.reason).toContain('Closed shapes')
  })
})

describe('object ids', () => {
  it('generates ids that do not collide', () => {
    const scene = sceneOf()
    expect(nextObjectId(scene, 'path')).toBe('path-1')
    const scene2 = sceneOf()
    scene2.objects.push({ id: 'path-1', type: 'path', d: 'M 0 0' })
    expect(nextObjectId(scene2, 'path')).toBe('path-2')
  })
})
