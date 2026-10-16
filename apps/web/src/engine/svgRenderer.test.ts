import { describe, expect, it } from 'vitest'
import type { VectorScene } from '@/types/scene'
import { renderSceneToSvg } from './svgRenderer'

const scene: VectorScene = {
  version: '1.0',
  document: { width: 100, height: 80, background: '#FFFFFF' },
  objects: [
    {
      id: 'text-node',
      type: 'text',
      x: 10,
      y: 20,
      content: '<script>alert("x")</script> & safe',
      fill: '#171717',
    },
  ],
}

describe('renderSceneToSvg', () => {
  it('escapes text and does not emit executable markup', () => {
    const svg = renderSceneToSvg(scene)

    expect(svg).toContain('&lt;script&gt;')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&amp; safe')
  })

  it('supports transparent output overrides', () => {
    const svg = renderSceneToSvg(scene, { background: null })

    expect(svg).not.toContain('width="100%"')
  })
})
