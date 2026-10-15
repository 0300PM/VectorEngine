import { isColor } from '@/core/color'
import type { FontStyle } from '@/core/document'
import type { FillRule } from '@/core/geometry'
import {
  absoluteUnitFactors,
  clampUnit,
  DEFAULT_FONT_SIZE,
  parseLength,
  parseNumber,
} from './numbers'
import { attribute } from './xml'

export type Paint =
  | { readonly kind: 'none' }
  | { readonly kind: 'color'; readonly color: string }
  | { readonly kind: 'currentColor' }
  | { readonly kind: 'reference'; readonly id: string }
  | { readonly kind: 'invalid'; readonly raw: string }

export type StyleProperties = {
  readonly fill?: Paint
  readonly stroke?: Paint
  readonly strokeWidth?: number
  readonly fillOpacity?: number
  readonly strokeOpacity?: number
  readonly opacity?: number
  readonly fillRule?: FillRule
  readonly color?: string
  readonly fontFamily?: string
  readonly fontSize?: number
  readonly fontWeight?: number
  readonly fontStyle?: FontStyle
  readonly display?: string
  readonly visibility?: string
  readonly strokeDasharray?: string
  readonly strokeLinejoin?: string
  readonly strokeLinecap?: string
}

export type ResolvedStyle = {
  readonly fill: Paint
  readonly stroke: Paint
  readonly strokeWidth: number
  readonly fillOpacity: number
  readonly strokeOpacity: number
  readonly fillRule: FillRule
  readonly color: string
  readonly fontFamily: string
  readonly fontSize: number
  readonly fontWeight: number
  readonly fontStyle: FontStyle
  readonly visibility: string
}

export const rootStyle: ResolvedStyle = {
  fill: { kind: 'color', color: '#000000' },
  stroke: { kind: 'none' },
  strokeWidth: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
  fillRule: 'nonzero',
  color: '#000000',
  fontFamily: 'sans-serif',
  fontSize: DEFAULT_FONT_SIZE,
  fontWeight: 400,
  fontStyle: 'normal',
  visibility: 'visible',
}

const referencePattern = /^url\(\s*["']?#([^"')]+)["']?\s*\)/i

export const parsePaint = (text: string | undefined): Paint | undefined => {
  if (text === undefined) {
    return undefined
  }
  const value = text.trim()
  if (value === '' || value === 'inherit') {
    return undefined
  }
  if (value === 'none' || value === 'transparent') {
    return { kind: 'none' }
  }
  if (value === 'currentColor') {
    return { kind: 'currentColor' }
  }
  const reference = referencePattern.exec(value)
  if (reference?.[1]) {
    return { kind: 'reference', id: reference[1] }
  }
  return isColor(value) ? { kind: 'color', color: value } : { kind: 'invalid', raw: value }
}

const fontSizeKeywords: Readonly<Record<string, number>> = {
  'xx-small': 9,
  'x-small': 10,
  small: 13,
  medium: 16,
  large: 18,
  'x-large': 24,
  'xx-large': 32,
}

export const resolveFontSize = (
  text: string | undefined,
  parentSize: number,
): number | undefined => {
  if (text === undefined) {
    return undefined
  }
  const keyword = fontSizeKeywords[text.trim().toLowerCase()]
  if (keyword !== undefined) {
    return keyword
  }
  const length = parseLength(text)
  if (!length) {
    return undefined
  }
  switch (length.unit) {
    case 'em':
    case 'rem':
      return length.value * parentSize
    case 'ex':
      return length.value * parentSize * 0.5
    case '%':
      return (length.value / 100) * parentSize
    default:
      return length.value * (absoluteUnitFactors[length.unit] ?? 1)
  }
}

export const resolveFontWeight = (
  text: string | undefined,
  parentWeight: number,
): number | undefined => {
  if (text === undefined) {
    return undefined
  }
  const value = text.trim().toLowerCase()
  switch (value) {
    case 'normal':
      return 400
    case 'bold':
      return 700
    case 'bolder':
      return Math.min(900, parentWeight + 300)
    case 'lighter':
      return Math.max(100, parentWeight - 300)
    default: {
      const numeric = Number(value)
      return Number.isFinite(numeric)
        ? Math.min(900, Math.max(100, Math.round(numeric / 100) * 100))
        : undefined
    }
  }
}

export const firstFontFamily = (text: string | undefined): string | undefined => {
  const first = text
    ?.split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '')
  return first ? first : undefined
}

const parseFontStyle = (text: string | undefined): FontStyle | undefined => {
  const value = text?.trim().toLowerCase()
  if (value === 'italic' || value === 'oblique') {
    return 'italic'
  }
  return value === 'normal' ? 'normal' : undefined
}

const parseUnitInterval = (text: string | undefined): number | undefined => {
  if (text === undefined) {
    return undefined
  }
  const trimmed = text.trim()
  if (trimmed.endsWith('%')) {
    const percent = Number(trimmed.slice(0, -1))
    return Number.isFinite(percent) ? clampUnit(percent / 100) : undefined
  }
  const value = Number(trimmed)
  return Number.isFinite(value) ? clampUnit(value) : undefined
}

const parseStrokeWidth = (text: string | undefined): number | undefined => {
  const length = parseLength(text)
  if (!length || length.unit === '%') {
    return undefined
  }
  return length.value * (absoluteUnitFactors[length.unit] ?? 1)
}

const parseFillRule = (text: string | undefined): FillRule | undefined => {
  const value = text?.trim()
  return value === 'evenodd' || value === 'nonzero' ? value : undefined
}

export type StyleContext = { readonly fontSize: number; readonly fontWeight: number }

const declarationsOf = (element: Element): Map<string, string> => {
  const declarations = new Map<string, string>()
  const presentation = [
    'fill',
    'stroke',
    'stroke-width',
    'fill-opacity',
    'stroke-opacity',
    'opacity',
    'fill-rule',
    'color',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'display',
    'visibility',
    'stroke-dasharray',
    'stroke-linejoin',
    'stroke-linecap',
  ]
  for (const name of presentation) {
    const value = attribute(element, name)
    if (value !== undefined) {
      declarations.set(name, value)
    }
  }
  for (const declaration of (attribute(element, 'style') ?? '').split(';')) {
    const separator = declaration.indexOf(':')
    if (separator > 0) {
      declarations.set(
        declaration.slice(0, separator).trim().toLowerCase(),
        declaration.slice(separator + 1).trim(),
      )
    }
  }
  return declarations
}

const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T

export const readStyleProperties = (element: Element, context: StyleContext): StyleProperties => {
  const declarations = declarationsOf(element)
  const read = (name: string): string | undefined => declarations.get(name)
  const color = read('color')
  return defined({
    fill: parsePaint(read('fill')),
    stroke: parsePaint(read('stroke')),
    strokeWidth: parseStrokeWidth(read('stroke-width')),
    fillOpacity: parseUnitInterval(read('fill-opacity')),
    strokeOpacity: parseUnitInterval(read('stroke-opacity')),
    opacity: parseUnitInterval(read('opacity')),
    fillRule: parseFillRule(read('fill-rule')),
    color: color !== undefined && isColor(color) ? color : undefined,
    fontFamily: firstFontFamily(read('font-family')),
    fontSize: resolveFontSize(read('font-size'), context.fontSize),
    fontWeight: resolveFontWeight(read('font-weight'), context.fontWeight),
    fontStyle: parseFontStyle(read('font-style')),
    display: read('display')?.trim(),
    visibility: read('visibility')?.trim(),
    strokeDasharray: read('stroke-dasharray')?.trim(),
    strokeLinejoin: read('stroke-linejoin')?.trim(),
    strokeLinecap: read('stroke-linecap')?.trim(),
  })
}

export const inheritStyle = (parent: ResolvedStyle, own: StyleProperties): ResolvedStyle => ({
  fill: own.fill ?? parent.fill,
  stroke: own.stroke ?? parent.stroke,
  strokeWidth: own.strokeWidth ?? parent.strokeWidth,
  fillOpacity: own.fillOpacity ?? parent.fillOpacity,
  strokeOpacity: own.strokeOpacity ?? parent.strokeOpacity,
  fillRule: own.fillRule ?? parent.fillRule,
  color: own.color ?? parent.color,
  fontFamily: own.fontFamily ?? parent.fontFamily,
  fontSize: own.fontSize ?? parent.fontSize,
  fontWeight: own.fontWeight ?? parent.fontWeight,
  fontStyle: own.fontStyle ?? parent.fontStyle,
  visibility: own.visibility ?? parent.visibility,
})

export const parseOpacityAttribute = (text: string | undefined): number | undefined =>
  parseUnitInterval(text)

export const parseNumberAttribute = parseNumber
