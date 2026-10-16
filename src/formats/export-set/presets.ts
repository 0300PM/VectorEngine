import type { ExportPreset } from './types'
import { createVariant, scaledVariant, squareVariant } from './variants'

const transparent = { mode: 'transparent' } as const

export const builtInPresets: readonly ExportPreset[] = [
  {
    id: 'web-logo',
    name: 'Web logo',
    builtIn: true,
    variants: [
      createVariant({ id: 'web-logo-svg', format: 'svg' }),
      squareVariant('png', 256, { id: 'web-logo-png-256', background: transparent }),
      squareVariant('png', 512, { id: 'web-logo-png-512', background: transparent }),
      squareVariant('png', 1024, { id: 'web-logo-png-1024', background: transparent }),
      createVariant({ id: 'web-logo-pdf', format: 'pdf' }),
    ],
  },
  {
    id: 'raster-scales',
    name: 'Raster 1×/2×/3×',
    builtIn: true,
    variants: [
      scaledVariant('png', 1, { id: 'raster-scales-1x' }),
      scaledVariant('png', 2, { id: 'raster-scales-2x' }),
      scaledVariant('png', 3, { id: 'raster-scales-3x' }),
    ],
  },
  {
    id: 'favicon',
    name: 'Favicon',
    builtIn: true,
    variants: [
      createVariant({
        id: 'favicon-ico',
        format: 'ico',
        fileName: 'favicon.ico',
        background: transparent,
      }),
      squareVariant('png', 180, {
        id: 'favicon-apple',
        fileName: 'apple-touch-icon.png',
        background: transparent,
      }),
      squareVariant('png', 192, {
        id: 'favicon-192',
        fileName: 'icon-192.png',
        background: transparent,
      }),
      squareVariant('png', 512, {
        id: 'favicon-512',
        fileName: 'icon-512.png',
        background: transparent,
      }),
      createVariant({
        id: 'favicon-svg',
        format: 'svg',
        fileName: 'icon.svg',
        background: transparent,
      }),
    ],
  },
]

export const findBuiltInPreset = (id: string): ExportPreset | undefined =>
  builtInPresets.find((preset) => preset.id === id)
