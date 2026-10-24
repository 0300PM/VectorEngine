import { describe, expect, it } from 'vitest'
import { getFieldByKey } from './fields'
import type { NumberField } from './fields'
import { clampNumber, validateNumber, validatePaint } from './validation'
import type { CircleObject, TextObject } from '@/types/scene'

const circle = (): CircleObject => ({ id: 'c', type: 'circle', cx: 0, cy: 0, radius: 10 })
const text = (): TextObject => ({
  id: 't',
  type: 'text',
  x: 0,
  y: 0,
  content: 'label',
  fontWeight: 400,
})

const numberField = (key: string): NumberField => getFieldByKey(key) as NumberField

describe('inspector value validation', () => {
  it('accepts in-range numeric values', () => {
    const result = validateNumber(numberField('radius'), circle(), '120')
    expect(result.valid).toBe(true)
    expect(result.value).toBe(120)
    expect(result.message).toBe('')
  })

  it('clamps and rejects out-of-range values', () => {
    const result = validateNumber(numberField('radius'), circle(), '9000000')
    expect(result.valid).toBe(false)
    expect(result.value).toBe(1_000_000)
    expect(result.message).toContain('between')
  })

  it('rejects non-numeric and empty input', () => {
    expect(validateNumber(numberField('radius'), circle(), 'abc').valid).toBe(false)
    expect(validateNumber(numberField('radius'), circle(), '   ').valid).toBe(false)
  })

  it('rejects negative sizes', () => {
    const result = validateNumber(numberField('width'), circle(), '-20')
    expect(result.valid).toBe(false)
    expect(result.value).toBe(0)
  })

  it('requires whole multiples for font weight', () => {
    const weight = numberField('fontWeight')
    expect(validateNumber(weight, text(), '150').valid).toBe(false)
    expect(validateNumber(weight, text(), '600').valid).toBe(true)
    expect(validateNumber(weight, text(), '1000').valid).toBe(false)
  })

  it('normalizes and validates paint values', () => {
    expect(validatePaint('#abc').normalized).toBe('#AABBCC')
    expect(validatePaint('#AABBCCDD').valid).toBe(true)
    expect(validatePaint('none').normalized).toBe('none')
    expect(validatePaint('url(#hero-grad)').valid).toBe(true)
    expect(validatePaint('not-a-color').valid).toBe(false)
    expect(validatePaint('').valid).toBe(false)
  })

  it('clamps numbers to a range', () => {
    expect(clampNumber(5, 0, 3)).toBe(3)
    expect(clampNumber(-5, 0, 3)).toBe(0)
    expect(clampNumber(2, 0, 3)).toBe(2)
  })
})
