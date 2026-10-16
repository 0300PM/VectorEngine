import { z } from 'zod'
import { isColor } from '@/core/color'
import { MAX_VARIANT_PADDING, exportFormats, type ExportPreset } from './types'

const colorSchema = z.string().trim().refine(isColor, { message: 'Unsupported color format' })

const positiveInteger = z.number().int().positive()

const sizeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('original') }),
  z.object({ mode: z.literal('scale'), factor: z.number().positive() }),
  z.object({ mode: z.literal('fixed'), width: positiveInteger, height: positiveInteger }),
  z.object({ mode: z.literal('sizes'), sizes: z.array(positiveInteger) }),
])

const backgroundSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('document') }),
  z.object({ mode: z.literal('transparent') }),
  z.object({ mode: z.literal('color'), color: colorSchema }),
])

export const exportVariantSchema = z.object({
  id: z.string().min(1),
  format: z.enum(exportFormats),
  size: sizeSchema,
  background: backgroundSchema,
  quality: z.number().min(0).max(1),
  suffix: z.string(),
  padding: z.number().min(0).max(MAX_VARIANT_PADDING),
  fileName: z.string().min(1).optional(),
  dpi: z.number().positive().optional(),
  recolor: colorSchema.optional(),
})

export const exportPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  variants: z.array(exportVariantSchema).min(1),
})

export const parseExportPresets = (value: unknown): ExportPreset[] | undefined => {
  const result = z.array(exportPresetSchema).safeParse(value)
  return result.success ? result.data : undefined
}
