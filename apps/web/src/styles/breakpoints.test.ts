import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPACT_WIDTHS,
  HEIGHT_TIERS,
  ULTRAWIDE,
  WIDTH_TIERS,
  maxHeightQuery,
  minWidthQuery,
  resolveHeightTier,
  resolveWidthTier,
  ultrawideQuery,
} from './breakpoints'

const css = readFileSync(join(process.cwd(), 'src/styles/main.css'), 'utf8')

const blockAt = (query: string): string => {
  const start = css.indexOf(query)
  if (start < 0) {
    return ''
  }
  let depth = 0
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') {
      depth += 1
    } else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return css.slice(start, index + 1)
      }
    }
  }
  return css.slice(start)
}

const columnValue = (query: string, name: string): number => {
  const match = blockAt(query).match(new RegExp(`--${name}:\\s*minmax\\(\\s*([\\d.]+)px`))
  return match ? Number(match[1]) : 0
}

const fixedColumnValue = (query: string, name: string): number => {
  const match = blockAt(query).match(new RegExp(`--${name}:\\s*([\\d.]+)px`))
  return match ? Number(match[1]) : 0
}

const sourceMax = (query: string): string => {
  const match = blockAt(query).match(/--col-source:\s*minmax\(\s*[\d.]+px,\s*([\d.]+%)\s*\)/)
  return match ? match[1]! : ''
}

describe('monitor resolution breakpoints', () => {
  it.each(WIDTH_TIERS)('declares the $resolution tier ($id)', (tier) => {
    expect(css).toContain(minWidthQuery(tier.minWidth))
  })

  it.each(WIDTH_TIERS)('keeps the $id column budget in sync with the stylesheet', (tier) => {
    const query = minWidthQuery(tier.minWidth)
    expect(columnValue(query, 'col-source')).toBe(tier.columns.sourceMin)
    expect(sourceMax(query)).toBe(tier.columns.sourceMax)
    expect(columnValue(query, 'col-preview')).toBe(tier.columns.previewMin)
    expect(fixedColumnValue(query, 'col-properties')).toBe(tier.columns.properties)
    expect(fixedColumnValue(query, 'col-export')).toBe(tier.columns.export)
  })

  it('lists the width tiers in ascending order', () => {
    const widths = WIDTH_TIERS.map((tier) => tier.minWidth)
    expect(widths).toEqual([...widths].sort((a, b) => a - b))

    const positions = WIDTH_TIERS.map((tier) => css.indexOf(minWidthQuery(tier.minWidth)))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('grows every panel as the monitor gets wider', () => {
    const source = WIDTH_TIERS.map((tier) => tier.columns.sourceMin)
    const preview = WIDTH_TIERS.map((tier) => tier.columns.previewMin)
    const properties = WIDTH_TIERS.map((tier) => tier.columns.properties)
    const exporter = WIDTH_TIERS.map((tier) => tier.columns.export)

    for (const series of [source, preview, properties, exporter]) {
      for (let index = 1; index < series.length; index += 1) {
        expect(series[index]!).toBeGreaterThan(series[index - 1]!)
      }
    }
  })

  it('fits the minimum column budget inside every tier', () => {
    for (const tier of WIDTH_TIERS) {
      const total =
        tier.columns.sourceMin + tier.columns.previewMin + tier.columns.properties + tier.columns.export
      expect(total).toBeLessThanOrEqual(tier.minWidth)
    }
  })

  it('covers the common desktop monitor resolutions', () => {
    const covered = WIDTH_TIERS.map((tier) => tier.resolution)
    for (const resolution of [
      '1280 × 800',
      '1366 × 768',
      '1440 × 900',
      '1600 × 900',
      '1680 × 1050',
      '1920 × 1080',
      '2048 × 1152',
      '2560 × 1440',
      '3440 × 1440',
      '3840 × 2160',
      '5120 × 2880',
    ]) {
      expect(covered).toContain(resolution)
    }
  })

  it('resolves the active tier for a viewport width', () => {
    expect(resolveWidthTier(1024)).toBeNull()
    expect(resolveWidthTier(1366)?.id).toBe('hd')
    expect(resolveWidthTier(1920)?.id).toBe('full-hd')
    expect(resolveWidthTier(2560)?.id).toBe('qhd')
    expect(resolveWidthTier(6016)?.id).toBe('uhd-5k')
  })

  it('resolves the densest applicable height tier', () => {
    expect(resolveHeightTier(1200)).toBeNull()
    expect(resolveHeightTier(900)?.id).toBe('short')
    expect(resolveHeightTier(800)?.id).toBe('laptop')
    expect(resolveHeightTier(720)?.id).toBe('hd-laptop')
    expect(resolveHeightTier(690)?.id).toBe('very-short')
    expect(resolveHeightTier(600)?.id).toBe('compact')
    expect(resolveHeightTier(560)?.id).toBe('compact')
  })
})

describe('monitor height breakpoints', () => {
  it.each(HEIGHT_TIERS)('declares the $resolution tier ($id)', (tier) => {
    expect(css).toContain(maxHeightQuery(tier.maxHeight, tier.minWidth))
  })

  it.each(HEIGHT_TIERS)('gates the $id tier to desktop widths', (tier) => {
    expect(tier.minWidth).toBe(901)
    expect(blockAt(maxHeightQuery(tier.maxHeight, tier.minWidth))).toContain(`(min-width: ${tier.minWidth}px)`)
  })

  it('orders the height tiers from tallest to shortest', () => {
    const heights = HEIGHT_TIERS.map((tier) => tier.maxHeight)
    expect(heights).toEqual([...heights].sort((a, b) => b - a))

    const positions = HEIGHT_TIERS.map((tier) => css.indexOf(maxHeightQuery(tier.maxHeight, tier.minWidth)))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})

describe('compact and ultrawide layouts', () => {
  it.each(COMPACT_WIDTHS)('declares the %ipx stacking tier', (width) => {
    expect(css).toContain(`@media (max-width: ${width}px)`)
  })

  it('gives ultrawide monitors a wider canvas', () => {
    expect(css).toContain(ultrawideQuery())
    expect(blockAt(ultrawideQuery())).toContain(`${ULTRAWIDE.previewMin}px`)
    const widest = WIDTH_TIERS[WIDTH_TIERS.length - 1]!
    expect(widest.ultrawide).toBe(true)
  })
})
