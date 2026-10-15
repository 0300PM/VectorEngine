export const documentFeatures = [
  'rectangle',
  'ellipse',
  'path',
  'text',
  'image',
  'group',
  'fill',
  'stroke',
  'evenodd',
  'cornerRadius',
  'nodeOpacity',
  'groupOpacity',
  'colorAlpha',
  'transparentBackground',
  'layers',
  'hiddenLayers',
  'lockedLayers',
  'physicalUnits',
  'displayP3',
  'assets',
  'metadata',
] as const

export type DocumentFeature = (typeof documentFeatures)[number]

export const contentFeatures = [
  'rectangle',
  'ellipse',
  'path',
  'text',
  'image',
  'group',
] as const satisfies readonly DocumentFeature[]

export type ContentFeature = (typeof contentFeatures)[number]

export const styleFeatures = [
  'fill',
  'stroke',
  'evenodd',
  'cornerRadius',
  'nodeOpacity',
  'groupOpacity',
  'colorAlpha',
  'transparentBackground',
  'displayP3',
] as const satisfies readonly DocumentFeature[]

export const structureFeatures = [
  'layers',
  'hiddenLayers',
  'lockedLayers',
  'physicalUnits',
  'assets',
  'metadata',
] as const satisfies readonly DocumentFeature[]

export const featureSupports = [
  'native',
  'converted',
  'rasterized',
  'dropped',
  'unsupported',
] as const

export type FeatureSupport = (typeof featureSupports)[number]

export type FormatCapabilities = Readonly<Record<DocumentFeature, FeatureSupport>>

export const targetMedia = ['vector', 'raster'] as const
export type TargetMedium = (typeof targetMedia)[number]

export type CapabilityTarget = {
  readonly id: string
  readonly label: string
  readonly capabilities: FormatCapabilities
  readonly medium?: TargetMedium
}

export const defineCapabilities = (
  defaults: FeatureSupport,
  overrides: Partial<FormatCapabilities> = {},
): FormatCapabilities =>
  Object.fromEntries(
    documentFeatures.map((feature) => [feature, overrides[feature] ?? defaults]),
  ) as Record<DocumentFeature, FeatureSupport>

export const isContentFeature = (feature: DocumentFeature): feature is ContentFeature =>
  (contentFeatures as readonly DocumentFeature[]).includes(feature)
