export const svgLengthUnits = ['px', 'pt', 'pc', 'mm', 'cm', 'in', 'em', 'ex', 'rem', '%'] as const
export type SvgLengthUnit = (typeof svgLengthUnits)[number]

export type SvgLength = { readonly value: number; readonly unit: SvgLengthUnit }

const NUMBER_SOURCE = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?'
const lengthPattern = new RegExp(
  `^\\s*(${NUMBER_SOURCE})\\s*(px|pt|pc|mm|cm|in|em|ex|rem|%)?\\s*$`,
  'i',
)
const numberListPattern = new RegExp(NUMBER_SOURCE, 'g')

export const absoluteUnitFactors: Readonly<Record<string, number>> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
}

export const DEFAULT_FONT_SIZE = 16

export const parseLength = (text: string | undefined): SvgLength | undefined => {
  if (text === undefined) {
    return undefined
  }
  const match = lengthPattern.exec(text)
  if (!match?.[1]) {
    return undefined
  }
  const value = Number(match[1])
  if (!Number.isFinite(value)) {
    return undefined
  }
  return { value, unit: (match[2]?.toLowerCase() ?? 'px') as SvgLengthUnit }
}

export const parseNumber = (text: string | undefined): number | undefined => {
  const length = parseLength(text)
  return length && length.unit === 'px' ? length.value : undefined
}

export const parseNumberList = (text: string | undefined): number[] =>
  (text?.match(numberListPattern) ?? []).map(Number).filter(Number.isFinite)

export const formatNumber = (value: number, precision = 4): string => {
  const rounded = Number(value.toFixed(precision))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

export const clampUnit = (value: number): number => Math.min(1, Math.max(0, value))
