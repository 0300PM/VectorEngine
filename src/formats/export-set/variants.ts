import { createId } from '@/core/document'
import {
  DEFAULT_VARIANT_QUALITY,
  type ExportFormat,
  type ExportVariant,
  type VariantSize,
} from './types'
import { defaultIcoSizes } from '../raster'

export type VariantInput = Partial<Omit<ExportVariant, 'id'>> & { readonly id?: string }

export const createVariant = (input: VariantInput = {}): ExportVariant => {
  const format: ExportFormat = input.format ?? 'png'
  const variant: ExportVariant = {
    id: input.id ?? createId('variant'),
    format,
    size:
      input.size ??
      (format === 'ico' ? { mode: 'sizes', sizes: [...defaultIcoSizes] } : { mode: 'original' }),
    background: input.background ?? { mode: 'document' },
    quality: input.quality ?? DEFAULT_VARIANT_QUALITY,
    suffix: input.suffix ?? '',
    padding: input.padding ?? 0,
  }
  return {
    ...variant,
    ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
    ...(input.dpi !== undefined ? { dpi: input.dpi } : {}),
    ...(input.recolor !== undefined ? { recolor: input.recolor } : {}),
  }
}

export const squareVariant = (
  format: ExportFormat,
  size: number,
  input: VariantInput = {},
): ExportVariant =>
  createVariant({
    format,
    size: { mode: 'fixed', width: size, height: size },
    suffix: `-${size}`,
    ...input,
  })

export const scaledVariant = (
  format: ExportFormat,
  factor: number,
  input: VariantInput = {},
): ExportVariant =>
  createVariant({
    format,
    size: { mode: 'scale', factor },
    suffix: factor === 1 ? '' : `@${factor}x`,
    ...input,
  })

export const describeSize = (size: VariantSize): string => {
  switch (size.mode) {
    case 'original':
      return '1:1'
    case 'scale':
      return `${size.factor}×`
    case 'fixed':
      return `${size.width}×${size.height}`
    case 'sizes':
      return size.sizes.join('/')
  }
}

export const sizeForFormat = (format: ExportFormat, size: VariantSize): VariantSize => {
  if (format === 'ico') {
    return size.mode === 'sizes' ? size : { mode: 'sizes', sizes: [...defaultIcoSizes] }
  }
  return size.mode === 'sizes' ? { mode: 'original' } : size
}
