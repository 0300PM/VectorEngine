/**
 * Monitor resolution breakpoint scale.
 *
 * The responsive layout in `main.css` is driven by one tier per common desktop
 * resolution. This module is the machine-readable copy of that scale: the
 * stylesheet test suite asserts that every entry below exists in the stylesheet
 * with the same column budget, so the two never drift apart.
 *
 * Width tiers are min-width queries and must stay in ascending order. Height
 * tiers are max-height queries, gated to desktop widths so that a short but
 * narrow window never inherits the dense desktop chrome.
 */

export interface WorkspaceColumns {
  /** Lower bound of the JSON source column in CSS pixels. */
  sourceMin: number
  /** Upper bound of the JSON source column. */
  sourceMax: string
  /** Lower bound of the canvas column in CSS pixels. */
  previewMin: number
  /** Fixed width of the inspector column in CSS pixels. */
  properties: number
  /** Fixed width of the export column in CSS pixels. */
  export: number
}

export interface WidthTier {
  id: string
  /** Short human label used by documentation and debugging. */
  label: string
  /** Reference monitor resolution this tier targets. */
  resolution: string
  /** CSS `min-width` in pixels. */
  minWidth: number
  /** True for 21:9 ultrawide monitors. */
  ultrawide: boolean
  columns: WorkspaceColumns
}

export interface HeightTier {
  id: string
  label: string
  resolution: string
  /** CSS `max-height` in pixels. */
  maxHeight: number
  /** Width guard so phones never get the dense desktop chrome. */
  minWidth: number
}

export const WIDTH_TIERS: readonly WidthTier[] = [
  {
    id: 'wxga',
    label: 'WXGA laptop',
    resolution: '1280 × 800',
    minWidth: 1280,
    ultrawide: false,
    columns: { sourceMin: 300, sourceMax: '27%', previewMin: 330, properties: 310, export: 290 },
  },
  {
    id: 'hd',
    label: 'HD laptop',
    resolution: '1366 × 768',
    minWidth: 1366,
    ultrawide: false,
    columns: { sourceMin: 320, sourceMax: '27%', previewMin: 340, properties: 320, export: 300 },
  },
  {
    id: 'wxga-plus',
    label: 'Desktop',
    resolution: '1440 × 900',
    minWidth: 1440,
    ultrawide: false,
    columns: { sourceMin: 340, sourceMax: '28%', previewMin: 360, properties: 340, export: 320 },
  },
  {
    id: 'hd-plus',
    label: 'Wide desktop',
    resolution: '1600 × 900',
    minWidth: 1600,
    ultrawide: false,
    columns: { sourceMin: 360, sourceMax: '28%', previewMin: 400, properties: 350, export: 330 },
  },
  {
    id: 'wsxga-plus',
    label: 'Large desktop',
    resolution: '1680 × 1050',
    minWidth: 1680,
    ultrawide: false,
    columns: { sourceMin: 380, sourceMax: '29%', previewMin: 420, properties: 360, export: 340 },
  },
  {
    id: 'full-hd',
    label: 'Full HD',
    resolution: '1920 × 1080',
    minWidth: 1920,
    ultrawide: false,
    columns: { sourceMin: 420, sourceMax: '30%', previewMin: 480, properties: 380, export: 360 },
  },
  {
    id: 'qxga',
    label: 'QHD workstation',
    resolution: '2048 × 1152',
    minWidth: 2048,
    ultrawide: false,
    columns: { sourceMin: 450, sourceMax: '30%', previewMin: 520, properties: 400, export: 370 },
  },
  {
    id: 'qhd',
    label: 'QHD',
    resolution: '2560 × 1440',
    minWidth: 2560,
    ultrawide: false,
    columns: { sourceMin: 480, sourceMax: '31%', previewMin: 600, properties: 420, export: 380 },
  },
  {
    id: 'uwqhd',
    label: 'Ultrawide QHD',
    resolution: '3440 × 1440',
    minWidth: 3440,
    ultrawide: true,
    columns: { sourceMin: 520, sourceMax: '30%', previewMin: 720, properties: 440, export: 400 },
  },
  {
    id: 'uhd-4k',
    label: '4K UHD',
    resolution: '3840 × 2160',
    minWidth: 3840,
    ultrawide: false,
    columns: { sourceMin: 540, sourceMax: '32%', previewMin: 800, properties: 460, export: 420 },
  },
  {
    id: 'uhd-5k',
    label: '5K',
    resolution: '5120 × 2880',
    minWidth: 5120,
    ultrawide: true,
    columns: { sourceMin: 600, sourceMax: '32%', previewMin: 900, properties: 520, export: 460 },
  },
]

export const HEIGHT_TIERS: readonly HeightTier[] = [
  {
    id: 'short',
    label: 'Short desktop',
    resolution: '1600 × 900',
    maxHeight: 900,
    minWidth: 901,
  },
  {
    id: 'laptop',
    label: 'Laptop',
    resolution: '1280 × 800',
    maxHeight: 820,
    minWidth: 901,
  },
  {
    id: 'hd-laptop',
    label: 'HD laptop',
    resolution: '1366 × 768',
    maxHeight: 768,
    minWidth: 901,
  },
  {
    id: 'very-short',
    label: 'Very short desktop',
    resolution: '1366 × 700',
    maxHeight: 700,
    minWidth: 901,
  },
  {
    id: 'compact',
    label: 'Compact window',
    resolution: '1280 × 600',
    maxHeight: 600,
    minWidth: 901,
  },
]

/** Narrow layouts stack panels instead of showing four columns. */
export const COMPACT_WIDTHS: readonly number[] = [1180, 900, 600]

/** Ultrawide monitors get a wider canvas without shrinking the side panels. */
export const ULTRAWIDE = {
  minWidth: 2560,
  aspectRatio: '21/9',
  previewMin: 900,
} as const

export const minWidthQuery = (width: number): string => `@media (min-width: ${width}px)`

export const maxHeightQuery = (height: number, minWidth: number = 901): string =>
  `@media (max-height: ${height}px) and (min-width: ${minWidth}px)`

export const ultrawideQuery = (): string =>
  `@media (min-aspect-ratio: ${ULTRAWIDE.aspectRatio}) and (min-width: ${ULTRAWIDE.minWidth}px)`

/** Smallest declared tier that fits the given viewport width. */
export const resolveWidthTier = (viewportWidth: number): WidthTier | null => {
  let match: WidthTier | null = null
  for (const tier of WIDTH_TIERS) {
    if (viewportWidth >= tier.minWidth) {
      match = tier
    }
  }
  return match
}

/** Densest declared height tier that still applies to the given viewport height. */
export const resolveHeightTier = (viewportHeight: number): HeightTier | null => {
  let match: HeightTier | null = null
  for (const tier of HEIGHT_TIERS) {
    if (viewportHeight <= tier.maxHeight) {
      match = tier
    }
  }
  return match
}
