import { describe, expect, it } from 'vitest'
import { defaultScene } from '@/data/defaultScene'
import type { VectorScene } from '@/types/scene'
import { FilenameCollisionResolver, formatExportFilename, sanitizeSegment } from './filename'
import { computeThumbnailDimensions, estimateExportMetrics } from './sizeEstimator'
import { validateExportOptions } from './validation'

describe('export option validation, naming templates, and size estimator', () => {
  const scene = JSON.parse(defaultScene) as VectorScene

  it('validates dimensions, memory limits, JPEG quality, HEX colors, and target existence', () => {
    expect(validateExportOptions({
      format: 'png',
      target: { type: 'scene' },
      scale: 2,
      background: 'transparent',
    }, scene).ok).toBe(true)

    const invalidQuality = validateExportOptions({
      format: 'jpeg',
      target: { type: 'scene' },
      quality: 140,
      background: 'document',
    }, scene)
    expect(invalidQuality.ok).toBe(false)
    expect(invalidQuality.errors[0]?.code).toBe('options.quality')

    const invalidHex = validateExportOptions({
      format: 'png',
      target: { type: 'scene' },
      background: { color: '#ZZZZZZ' },
    }, scene)
    expect(invalidHex.ok).toBe(false)
    expect(invalidHex.errors[0]?.code).toBe('options.background')

    const missingTarget = validateExportOptions({
      format: 'svg',
      target: { type: 'object', objectId: 'does-not-exist' },
      background: 'document',
    }, scene)
    expect(missingTarget.ok).toBe(false)
    expect(missingTarget.errors[0]?.code).toBe('target.notFound')

    const memoryExceeded = validateExportOptions({
      format: 'png',
      target: { type: 'scene' },
      width: 4000,
      height: 4000,
      maxMemoryBytes: 32 * 1024 * 1024,
      background: 'document',
    }, scene)
    expect(memoryExceeded.ok).toBe(false)
    expect(memoryExceeded.errors[0]?.code).toBe('limit.memory')

    const ignoredWarnings = validateExportOptions({
      format: 'png',
      target: { type: 'scene' },
      quality: 75,
      minifySvg: true,
      background: 'transparent',
    }, scene)
    expect(ignoredWarnings.ok).toBe(true)
    expect(ignoredWarnings.warnings).toHaveLength(2)
  })

  it('expands filename templates, sanitizes unsafe characters, and resolves collisions deterministically', () => {
    expect(sanitizeSegment('../CON:Hero*Card?')).toBe('con-hero-card')
    expect(sanitizeSegment('PRN')).toBe('prn-file')

    const name = formatExportFilename('{document}_{object}_{scale}', {
      document: 'Orbit Study',
      target: { type: 'object', objectId: 'core' },
      objectLabel: 'Core Sphere',
      scale: 2,
      scaleMode: 'preset',
      width: 432,
      height: 432,
      format: 'png',
      index: 0,
    })
    expect(name).toBe('orbit-study_core-sphere_2x.png')

    const resolver = new FilenameCollisionResolver()
    expect(resolver.claim('a', 'badge.png')).toBe('badge.png')
    expect(resolver.claim('b', 'Badge.png')).toBe('Badge-2.png')
    expect(resolver.claim('c', 'badge.png')).toBe('badge-3.png')
    expect(resolver.collisions).toHaveLength(2)
  })

  it('computes BMP exact byte sizes, alpha warnings, memory warnings, and thumbnail downscaling', () => {
    const bmp24 = estimateExportMetrics({
      scene,
      format: 'bmp',
      width: 101,
      height: 50,
      background: 'transparent',
      bmpBitDepth: 24,
    })
    expect(bmp24.exactSizeKnown).toBe(true)
    expect(bmp24.estimatedBytes).toBe(54 + 304 * 50)
    expect(bmp24.hasAlpha).toBe(false)
    expect(bmp24.warnings.length).toBeGreaterThan(0)

    const bmp32 = estimateExportMetrics({
      scene,
      format: 'bmp',
      width: 101,
      height: 50,
      background: 'transparent',
      bmpBitDepth: 32,
    })
    expect(bmp32.estimatedBytes).toBe(122 + 101 * 50 * 4)
    expect(bmp32.hasAlpha).toBe(true)

    const thumb = computeThumbnailDimensions(6000, 3000, 320)
    expect(thumb).toEqual({ width: 320, height: 160, downscaled: true })
  })
})
