import type { VectorDocument } from '@/core/document'
import { bytesToBlob, encodeText } from '../types'
import {
  createVariant,
  documentScope,
  runExportSet,
  squareVariant,
  type ExportSet,
  type ExportSetContext,
  type VariantBackground,
} from '../export-set'
import { checkIconReadability } from './readability'
import { requireFiles, type AssetStudioResult, type ExtraFile } from './types'

export const FAVICON_ICO_FILE = 'favicon.ico'
export const FAVICON_SVG_FILE = 'icon.svg'
export const FAVICON_MANIFEST_FILE = 'site.webmanifest'
export const FAVICON_HTML_FILE = 'favicon.html'
export const APPLE_TOUCH_ICON_FILE = 'apple-touch-icon.png'

export const faviconIcoSizes = [16, 32, 48] as const
export const faviconPngSizes = [192, 512] as const
export const APPLE_TOUCH_ICON_SIZE = 180

export const faviconPngFileName = (size: number): string => `icon-${size}.png`

export type FaviconOptions = {
  readonly appName: string
  readonly themeColor: string
  readonly background: VariantBackground
  readonly padding: number
  readonly includeSvg: boolean
}

export const defaultFaviconOptions: FaviconOptions = {
  appName: 'App',
  themeColor: '#ffffff',
  background: { mode: 'transparent' },
  padding: 0,
  includeSvg: true,
}

export const faviconExportSet = (options: FaviconOptions): ExportSet => {
  const shared = { background: options.background, padding: options.padding }
  return {
    name: 'favicon',
    scope: documentScope,
    variants: [
      createVariant({
        id: 'favicon-ico',
        format: 'ico',
        fileName: FAVICON_ICO_FILE,
        size: { mode: 'sizes', sizes: [...faviconIcoSizes] },
        ...shared,
      }),
      squareVariant('png', APPLE_TOUCH_ICON_SIZE, {
        id: 'favicon-apple',
        fileName: APPLE_TOUCH_ICON_FILE,
        ...shared,
      }),
      ...faviconPngSizes.map((size) =>
        squareVariant('png', size, {
          id: `favicon-${size}`,
          fileName: faviconPngFileName(size),
          ...shared,
        }),
      ),
      ...(options.includeSvg
        ? [
            createVariant({
              id: 'favicon-svg',
              format: 'svg',
              fileName: FAVICON_SVG_FILE,
              ...shared,
            }),
          ]
        : []),
    ],
  }
}

export const requiredFaviconFiles = (options: FaviconOptions): readonly string[] => [
  FAVICON_ICO_FILE,
  APPLE_TOUCH_ICON_FILE,
  ...faviconPngSizes.map(faviconPngFileName),
  ...(options.includeSvg ? [FAVICON_SVG_FILE] : []),
]

export const faviconManifest = (options: FaviconOptions): string =>
  JSON.stringify(
    {
      name: options.appName,
      short_name: options.appName,
      icons: faviconPngSizes.map((size) => ({
        src: `/${faviconPngFileName(size)}`,
        sizes: `${size}x${size}`,
        type: 'image/png',
      })),
      theme_color: options.themeColor,
      background_color: options.themeColor,
      display: 'standalone',
    },
    null,
    2,
  )

export const faviconHtml = (options: FaviconOptions): string =>
  [
    `<link rel="icon" href="/${FAVICON_ICO_FILE}" sizes="${faviconIcoSizes.map((size) => `${size}x${size}`).join(' ')}">`,
    ...(options.includeSvg
      ? [`<link rel="icon" href="/${FAVICON_SVG_FILE}" type="image/svg+xml">`]
      : []),
    `<link rel="apple-touch-icon" href="/${APPLE_TOUCH_ICON_FILE}">`,
    `<link rel="manifest" href="/${FAVICON_MANIFEST_FILE}">`,
    `<meta name="theme-color" content="${options.themeColor}">`,
  ].join('\n')

export type FaviconResult = AssetStudioResult & { readonly html: string }

export const runFaviconStudio = async (
  document: VectorDocument,
  options: FaviconOptions,
  context: ExportSetContext,
): Promise<FaviconResult> => {
  const set = faviconExportSet(options)
  const result = await runExportSet(document, set, 'favicon', context)
  const html = faviconHtml(options)
  const extras: ExtraFile[] = [
    {
      fileName: FAVICON_MANIFEST_FILE,
      blob: bytesToBlob(encodeText(faviconManifest(options)), 'application/manifest+json'),
    },
    { fileName: FAVICON_HTML_FILE, blob: bytesToBlob(encodeText(html), 'text/html') },
  ]
  const readability = set.variants[0]
    ? await checkIconReadability(document, set.variants[0], context)
    : []
  return {
    files: result.files,
    extras,
    failures: result.failures,
    problems: [...requireFiles(result.files, requiredFaviconFiles(options)), ...readability],
    html,
  }
}
