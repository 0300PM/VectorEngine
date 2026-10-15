export const documentUnits = ['px', 'mm', 'cm', 'in', 'pt'] as const
export type DocumentUnit = (typeof documentUnits)[number]

export const colorSpaces = ['sRGB', 'Display-P3'] as const
export type ColorSpace = (typeof colorSpaces)[number]

export const CSS_REFERENCE_DPI = 96

const inchesPerUnit: Readonly<Record<Exclude<DocumentUnit, 'px'>, number>> = {
  in: 1,
  pt: 1 / 72,
  mm: 1 / 25.4,
  cm: 1 / 2.54,
}

export const pixelsPerUnit = (unit: DocumentUnit, dpi = CSS_REFERENCE_DPI): number =>
  unit === 'px' ? 1 : inchesPerUnit[unit] * dpi

export const toPixels = (value: number, unit: DocumentUnit, dpi = CSS_REFERENCE_DPI): number =>
  value * pixelsPerUnit(unit, dpi)
