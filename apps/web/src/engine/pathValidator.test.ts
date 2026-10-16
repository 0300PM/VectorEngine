import { describe, expect, it } from 'vitest'
import { isValidPathData } from './pathValidator'

describe('isValidPathData', () => {
  it('accepts absolute, relative, curve, and arc commands', () => {
    expect(isValidPathData('M10 10 l20 0 C30 20 40 30 50 10 A10 10 0 0 1 70 10 Z')).toBe(true)
  })

  it('rejects missing parameters and invalid arc flags', () => {
    expect(isValidPathData('M10 C20')).toBe(false)
    expect(isValidPathData('M0 0 A10 10 0 2 0 20 20')).toBe(false)
  })

  it('requires a move command first', () => {
    expect(isValidPathData('L10 10')).toBe(false)
  })
})
