import { describe, expect, it } from 'vitest'
import { defaultScene } from '@/data/defaultScene'
import { validateSceneSource } from './validator'

describe('validateSceneSource', () => {
  it('accepts the example scene', () => {
    const result = validateSceneSource(defaultScene)

    expect(result.valid).toBe(true)
    expect(result.scene?.objects).toHaveLength(10)
  })

  it('rejects malformed JSON with an offset', () => {
    const result = validateSceneSource('{"version":')

    expect(result.valid).toBe(false)
    expect(result.issues[0]?.code).toBe('json.parse')
  })

  it('rejects duplicate object identifiers', () => {
    const value = JSON.parse(defaultScene) as { objects: unknown[] }
    value.objects.push(value.objects[0])
    const result = validateSceneSource(JSON.stringify(value))

    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.code === 'semantic.duplicateId')).toBe(true)
  })

  it('rejects unsupported object properties', () => {
    const value = JSON.parse(defaultScene) as { objects: Record<string, unknown>[] }
    value.objects[0]!.remoteUrl = 'https://example.com/image.png'
    const result = validateSceneSource(JSON.stringify(value))

    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.code === 'schema.unevaluatedProperties')).toBe(true)
  })
})
