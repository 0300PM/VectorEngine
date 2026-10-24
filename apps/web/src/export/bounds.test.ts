import { describe, expect, it } from 'vitest'
import { defaultScene } from '@/data/defaultScene'
import type { VectorScene } from '@/types/scene'
import {
  collectSceneCatalog,
  computeSceneContentBounds,
  extractScopedScene,
  resolveExportViewport,
} from './bounds'

describe('bounds and scope extraction', () => {
  const parsedDefault = JSON.parse(defaultScene) as VectorScene

  it('enumerates scene catalog entries across objects, groups, layers, and workspaces', () => {
    const catalog = collectSceneCatalog(parsedDefault)

    expect(catalog.objects.length).toBeGreaterThanOrEqual(12)
    expect(catalog.groups.map((g) => g.id)).toContain('satellites')
    expect(catalog.layers.map((l) => l.id)).toEqual(
      expect.arrayContaining(['surface', 'orbits', 'core-system', 'typography']),
    )
    expect(catalog.workspaces.map((w) => w.id)).toEqual(['hero-card', 'center-emblem'])
  })

  it('excludes hidden objects by default and includes them when includeHidden is enabled', () => {
    const defaultScoped = extractScopedScene(parsedDefault, { type: 'group', objectId: 'satellites' }, false)
    const withHiddenScoped = extractScopedScene(parsedDefault, { type: 'group', objectId: 'satellites' }, true)

    const defaultGroup = defaultScoped.objects[0]
    const withHiddenGroup = withHiddenScoped.objects[0]

    expect(defaultGroup?.type).toBe('group')
    expect(withHiddenGroup?.type).toBe('group')
    if (defaultGroup?.type === 'group' && withHiddenGroup?.type === 'group') {
      expect(defaultGroup.children.map((c) => c.id)).toEqual(['node-a', 'node-b'])
      expect(withHiddenGroup.children.map((c) => c.id)).toEqual(['node-a', 'node-b', 'guide-grid'])
    }
  })

  it('preserves parent group transformations and draw order when extracting nested child selections', () => {
    const nestedScene: VectorScene = {
      version: '1.0',
      document: { width: 500, height: 400 },
      objects: [
        {
          id: 'bg-rect',
          type: 'rect',
          x: 0,
          y: 0,
          width: 500,
          height: 400,
          fill: '#EEEEEE',
        },
        {
          id: 'outer-group',
          type: 'group',
          transform: { translateX: 120, translateY: 80, scaleX: 2, scaleY: 2 },
          children: [
            { id: 'skip-child', type: 'rect', x: 0, y: 0, width: 10, height: 10 },
            { id: 'target-child', type: 'rect', x: 15, y: 25, width: 40, height: 30, stroke: '#111111', strokeWidth: 4 },
          ],
        },
      ],
    }

    const scoped = extractScopedScene(nestedScene, { type: 'selection', objectIds: ['target-child'] }, false)
    expect(scoped.objects).toHaveLength(1)
    expect(scoped.objects[0]?.id).toBe('outer-group')

    const tight = computeSceneContentBounds(scoped, true)
    expect(tight).not.toBeNull()
    expect(tight!.x).toBeCloseTo(120 + 15 * 2 - 4, 4)
    expect(tight!.y).toBeCloseTo(80 + 25 * 2 - 4, 4)
    expect(tight!.width).toBeCloseTo(40 * 2 + 8, 4)
    expect(tight!.height).toBeCloseTo(30 * 2 + 8, 4)
  })

  it('resolves tight bounds, margin, custom dimensions, and workspace crop regions accurately', () => {
    const coreScoped = extractScopedScene(parsedDefault, { type: 'object', objectId: 'core' }, false)
    const viewport = resolveExportViewport(parsedDefault, coreScoped, {
      target: { type: 'object', objectId: 'core' },
      trimToBounds: true,
      margin: 12,
      scale: 2,
      fitMode: 'contain',
      clipToBounds: true,
    })

    expect(viewport.sourceBox.x).toBeCloseTo(492, 3)
    expect(viewport.sourceBox.y).toBeCloseTo(280, 3)
    expect(viewport.sourceBox.width).toBeCloseTo(216, 3)
    expect(viewport.sourceBox.height).toBeCloseTo(216, 3)
    expect(viewport.viewBox.width).toBeCloseTo(240, 3)
    expect(viewport.viewBox.height).toBeCloseTo(240, 3)
    expect(viewport.outputWidth).toBe(480)
    expect(viewport.outputHeight).toBe(480)
    expect(viewport.clipToBounds).toBe(true)

    const wsViewport = resolveExportViewport(parsedDefault, parsedDefault, {
      target: { type: 'workspace', workspaceId: 'center-emblem' },
      scale: 3,
    })
    expect(wsViewport.outputWidth).toBe(900)
    expect(wsViewport.outputHeight).toBe(900)
  })
})
