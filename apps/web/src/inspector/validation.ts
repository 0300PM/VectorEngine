import { normalizeColor, parseColor } from '@/engine/color'
import type { SceneObject } from '@/types/scene'
import type { NumberField, NumericBound } from './fields'

export interface NumberValidation {
  valid: boolean
  value: number
  message: string
}

export interface PaintValidation {
  valid: boolean
  normalized: string
  message: string
}

const paintPattern =
  /^(none|#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{4}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8}|url\(#[A-Za-z][A-Za-z0-9_.:-]*\))$/

export const resolveBound = (bound: NumericBound, object: SceneObject): number =>
  typeof bound === 'function' ? bound(object) : bound

export const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const formatBound = (value: number): string =>
  Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(2)

export const validateNumber = (
  field: NumberField,
  object: SceneObject,
  raw: string,
): NumberValidation => {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { valid: false, value: 0, message: 'Value is required' }
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return { valid: false, value: 0, message: 'Must be a number' }
  }

  const min = resolveBound(field.min, object)
  const max = resolveBound(field.max, object)
  if (parsed < min || parsed > max) {
    return {
      valid: false,
      value: clampNumber(parsed, min, max),
      message: `Must be between ${formatBound(min)} and ${formatBound(max)}`,
    }
  }

  if (field.integer && !Number.isInteger(parsed)) {
    return { valid: false, value: Math.round(parsed), message: 'Must be a whole number' }
  }

  if (field.multipleOf !== undefined && field.multipleOf > 0) {
    const remainder = parsed % field.multipleOf
    if (Math.abs(remainder) > 1e-9 && Math.abs(remainder - field.multipleOf) > 1e-9) {
      const snapped = Math.round(parsed / field.multipleOf) * field.multipleOf
      return {
        valid: false,
        value: clampNumber(snapped, min, max),
        message: `Must be a multiple of ${field.multipleOf}`,
      }
    }
  }

  return { valid: true, value: parsed, message: '' }
}

export const validatePaint = (raw: string): PaintValidation => {
  const value = raw.trim()
  if (value === '') {
    return { valid: false, normalized: '', message: 'Value is required' }
  }
  if (!paintPattern.test(value)) {
    return { valid: false, normalized: value, message: 'Use #RRGGBB, #RRGGBBAA, or none' }
  }
  if (value === 'none') {
    return { valid: true, normalized: 'none', message: '' }
  }
  if (value.startsWith('url(#')) {
    return { valid: true, normalized: value, message: '' }
  }
  if (!parseColor(value)) {
    return { valid: false, normalized: value, message: 'Invalid color value' }
  }
  return { valid: true, normalized: normalizeColor(value), message: '' }
}

export const isHexPaint = (value: string | undefined): value is string =>
  typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)

export const isGradientPaint = (value: string | undefined): value is string =>
  typeof value === 'string' && value.startsWith('url(#')
