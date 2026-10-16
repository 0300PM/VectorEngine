import type { Color, VectorDocument } from '@/core/document'
import { bytesToBlob, encodeText } from '../types'
import {
  documentScope,
  runExportSet,
  squareVariant,
  type ExportSet,
  type ExportSetContext,
  type ExportVariant,
  type VariantBackground,
} from '../export-set'
import { checkIconReadability } from './readability'
import { requireFiles, type AssetStudioResult } from './types'

export const appIconSizes = [48, 72, 96, 144, 192, 256, 512, 1024] as const
export const APP_ICON_INDEX_FILE = 'icons.json'

export const appIconVariantKinds = ['default', 'monochrome', 'dark'] as const
export type AppIconVariantKind = (typeof appIconVariantKinds)[number]

export type AppIconOptions = {
  readonly sizes: readonly number[]
  readonly background: VariantBackground
  readonly padding: number
  readonly monochrome?: Color
  readonly dark?: { readonly background: Color; readonly recolor?: Color }
}

export const defaultAppIconOptions: AppIconOptions = {
  sizes: [...appIconSizes],
  background: { mode: 'document' },
  padding: 0.1,
}

export const appIconFileName = (kind: AppIconVariantKind, size: number): string =>
  kind === 'default' ? `icon-${size}.png` : `icon-${kind}-${size}.png`

const kindVariant = (
  kind: AppIconVariantKind,
  size: number,
  options: AppIconOptions,
): ExportVariant | undefined => {
  const base = {
    id: `app-icon-${kind}-${size}`,
    fileName: appIconFileName(kind, size),
    padding: options.padding,
  }
  switch (kind) {
    case 'default':
      return squareVariant('png', size, { ...base, background: options.background })
    case 'monochrome':
      return options.monochrome
        ? squareVariant('png', size, {
            ...base,
            background: { mode: 'transparent' },
            recolor: options.monochrome,
          })
        : undefined
    case 'dark':
      return options.dark
        ? squareVariant('png', size, {
            ...base,
            background: { mode: 'color', color: options.dark.background },
            ...(options.dark.recolor ? { recolor: options.dark.recolor } : {}),
          })
        : undefined
  }
}

export const appIconExportSet = (options: AppIconOptions): ExportSet => ({
  name: 'app-icons',
  scope: documentScope,
  variants: appIconVariantKinds.flatMap((kind) =>
    options.sizes
      .map((size) => kindVariant(kind, size, options))
      .filter((variant): variant is ExportVariant => variant !== undefined),
  ),
})

export const appIconIndex = (set: ExportSet, options: AppIconOptions): string =>
  JSON.stringify(
    {
      padding: options.padding,
      icons: set.variants.map((variant) => ({
        src: variant.fileName,
        sizes: variant.size.mode === 'fixed' ? `${variant.size.width}x${variant.size.height}` : '',
        type: 'image/png',
        variant: variant.id.replace(/^app-icon-/, '').replace(/-\d+$/, ''),
      })),
    },
    null,
    2,
  )

export const runAppIconStudio = async (
  document: VectorDocument,
  options: AppIconOptions,
  context: ExportSetContext,
): Promise<AssetStudioResult> => {
  const set = appIconExportSet(options)
  const result = await runExportSet(document, set, 'icon', context)
  const required = set.variants.map((variant) => variant.fileName ?? '')
  const readability = set.variants[0]
    ? await checkIconReadability(document, set.variants[0], context)
    : []
  return {
    files: result.files,
    extras: [
      {
        fileName: APP_ICON_INDEX_FILE,
        blob: bytesToBlob(encodeText(appIconIndex(set, options)), 'application/json'),
      },
    ],
    failures: result.failures,
    problems: [...requireFiles(result.files, required), ...readability],
  }
}
