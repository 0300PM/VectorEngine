import { describe, expect, it } from 'vitest'
import { formatColor, formatCssColor, isColor, parseColor } from './parse'

describe('parseColor', () => {
  it('parses hex colors in short and long forms', () => {
    expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    expect(parseColor('#ff000080')?.a).toBeCloseTo(128 / 255)
    expect(parseColor('#2563eb')).toEqual({ r: 37 / 255, g: 99 / 255, b: 235 / 255, a: 1 })
  })

  it('parses functional notations', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(parseColor('rgba(0 0 255 / 50%)')).toEqual({ r: 0, g: 0, b: 1, a: 0.5 })
    const green = parseColor('hsl(120, 100%, 50%)')
    expect(green?.r).toBeCloseTo(0)
    expect(green?.g).toBeCloseTo(1)
    expect(green?.b).toBeCloseTo(0)
  })

  it('parses named colors and transparent', () => {
    expect(parseColor('RebeccaPurple')).toEqual({ r: 102 / 255, g: 51 / 255, b: 153 / 255, a: 1 })
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('rejects malformed input', () => {
    expect(parseColor('')).toBeUndefined()
    expect(parseColor('#12')).toBeUndefined()
    expect(parseColor('rgb(1, 2)')).toBeUndefined()
    expect(parseColor('not-a-color')).toBeUndefined()
    expect(isColor(42)).toBe(false)
  })
})

describe('formatColor', () => {
  it('round-trips through hex notation', () => {
    expect(formatColor({ r: 1, g: 0.5, b: 0, a: 1 })).toBe('#ff8000')
    expect(formatColor({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080')
    expect(formatCssColor({ r: 1, g: 1, b: 1, a: 0.25 })).toBe('rgba(255, 255, 255, 0.25)')
  })
})
