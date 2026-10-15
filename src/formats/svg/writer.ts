import { formatColor, parseColor } from '@/core/color'
import type { AssetReference, Layer, PaintStyle, VectorDocument, VectorNode } from '@/core/document'
import { isIdentity } from '@/core/geometry'
import { defineCapabilities } from '../compatibility/features'
import type { Transformation, ValidationStatus, WriteResult } from '../compatibility/report'
import { bytesToBlob, encodeText, type DocumentWriter } from '../types'
import { formatNumber } from './numbers'
import { formatPathData } from './path-data'
import { formatTransform } from './transform'
import { escapeXml, localName, type XmlParser } from './xml'

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
export const SVG_MIME_TYPE = 'image/svg+xml'
export const SVG_FORMAT_ID = 'svg'

export const svgDataAttributes = Object.freeze({
  role: 'data-role',
  layer: 'data-layer',
  locked: 'data-locked',
  name: 'data-name',
})

export const SVG_BACKGROUND_ROLE = 'background'

type AttributeValue = string | number | undefined
type Attributes = Readonly<Record<string, AttributeValue>>

type WriterContext = {
  readonly assets: ReadonlyMap<string, AssetReference>
  readonly skipped: string[]
  processed: number
}

const INDENT = '  '

const attributeText = (attributes: Attributes): string =>
  Object.entries(attributes)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => ` ${name}="${escapeXml(String(value))}"`)
    .join('')

const element = (
  name: string,
  attributes: Attributes,
  children: readonly string[],
  depth: number,
): string => {
  const indent = INDENT.repeat(depth)
  if (children.length === 0) {
    return `${indent}<${name}${attributeText(attributes)}/>`
  }
  return `${indent}<${name}${attributeText(attributes)}>\n${children.join('\n')}\n${indent}</${name}>`
}

const inlineElement = (
  name: string,
  attributes: Attributes,
  content: string,
  depth: number,
): string => `${INDENT.repeat(depth)}<${name}${attributeText(attributes)}>${content}</${name}>`

const paintAttributes = (style: PaintStyle): Attributes => {
  const fill = style.fill ? parseColor(style.fill.color) : undefined
  const strokeWidth = style.stroke && style.stroke.width > 0 ? style.stroke.width : undefined
  const stroke =
    strokeWidth !== undefined && style.stroke ? parseColor(style.stroke.color) : undefined
  return {
    fill: fill ? formatColor({ ...fill, a: 1 }) : 'none',
    'fill-opacity': fill && fill.a < 1 ? formatNumber(fill.a) : undefined,
    stroke: stroke ? formatColor({ ...stroke, a: 1 }) : undefined,
    'stroke-opacity': stroke && stroke.a < 1 ? formatNumber(stroke.a) : undefined,
    'stroke-width': stroke && strokeWidth !== undefined ? formatNumber(strokeWidth) : undefined,
    'stroke-linejoin': stroke ? 'round' : undefined,
    'stroke-linecap': stroke ? 'round' : undefined,
  }
}

const commonAttributes = (node: VectorNode): Attributes => ({
  id: node.id,
  [svgDataAttributes.name]: node.name,
  opacity: node.opacity < 1 ? formatNumber(node.opacity) : undefined,
  transform: isIdentity(node.transform) ? undefined : formatTransform(node.transform, formatNumber),
})

const serializeNode = (
  node: VectorNode,
  context: WriterContext,
  depth: number,
): string | undefined => {
  switch (node.type) {
    case 'rectangle':
      context.processed += 1
      return element(
        'rect',
        {
          ...commonAttributes(node),
          x: formatNumber(node.x),
          y: formatNumber(node.y),
          width: formatNumber(node.width),
          height: formatNumber(node.height),
          rx: node.cornerRadius > 0 ? formatNumber(node.cornerRadius) : undefined,
          ...paintAttributes(node.style),
        },
        [],
        depth,
      )
    case 'ellipse':
      context.processed += 1
      return element(
        'ellipse',
        {
          ...commonAttributes(node),
          cx: formatNumber(node.cx),
          cy: formatNumber(node.cy),
          rx: formatNumber(node.rx),
          ry: formatNumber(node.ry),
          ...paintAttributes(node.style),
        },
        [],
        depth,
      )
    case 'path':
      context.processed += 1
      return element(
        'path',
        {
          ...commonAttributes(node),
          d: formatPathData(node.geometry.commands),
          'fill-rule': node.geometry.fillRule === 'evenodd' ? 'evenodd' : undefined,
          ...paintAttributes(node.style),
        },
        [],
        depth,
      )
    case 'text':
      context.processed += 1
      return inlineElement(
        'text',
        {
          ...commonAttributes(node),
          x: formatNumber(node.x),
          y: formatNumber(node.y),
          'font-family': node.font.family,
          'font-size': formatNumber(node.font.size),
          'font-weight': node.font.weight === 400 ? undefined : node.font.weight,
          'font-style': node.font.style === 'italic' ? 'italic' : undefined,
          'xml:space': 'preserve',
          ...paintAttributes(node.style),
        },
        escapeXml(node.content),
        depth,
      )
    case 'image': {
      const asset = context.assets.get(node.assetId)
      if (!asset) {
        context.skipped.push(node.id)
        return undefined
      }
      context.processed += 1
      return element(
        'image',
        {
          ...commonAttributes(node),
          x: formatNumber(node.x),
          y: formatNumber(node.y),
          width: formatNumber(node.width),
          height: formatNumber(node.height),
          href: asset.path,
        },
        [],
        depth,
      )
    }
    case 'group': {
      context.processed += 1
      const children = node.children
        .map((child) => serializeNode(child, context, depth + 1))
        .filter((child): child is string => child !== undefined)
      return element('g', commonAttributes(node), children, depth)
    }
  }
}

const serializeLayer = (layer: Layer, context: WriterContext, depth: number): string =>
  element(
    'g',
    {
      id: layer.id,
      [svgDataAttributes.layer]: layer.name,
      [svgDataAttributes.locked]: layer.locked ? 'true' : undefined,
      opacity: layer.opacity < 1 ? formatNumber(layer.opacity) : undefined,
      display: layer.visible ? undefined : 'none',
    },
    layer.children
      .map((node) => serializeNode(node, context, depth + 1))
      .filter((node): node is string => node !== undefined),
    depth,
  )

const sizeAttribute = (value: number, unit: VectorDocument['unit']): string =>
  unit === 'px' ? formatNumber(value) : `${formatNumber(value)}${unit}`

const backgroundElement = (document: VectorDocument): string | undefined => {
  const color = document.background ? parseColor(document.background) : undefined
  if (!color || color.a <= 0) {
    return undefined
  }
  return element(
    'rect',
    {
      [svgDataAttributes.role]: SVG_BACKGROUND_ROLE,
      width: formatNumber(document.width),
      height: formatNumber(document.height),
      fill: formatColor({ ...color, a: 1 }),
      'fill-opacity': color.a < 1 ? formatNumber(color.a) : undefined,
    },
    [],
    1,
  )
}

export const serializeSvg = (
  document: VectorDocument,
): { text: string; context: WriterContext } => {
  const context: WriterContext = {
    assets: new Map(document.assets.map((asset) => [asset.id, asset])),
    skipped: [],
    processed: 0,
  }
  const children = [
    inlineElement('title', {}, escapeXml(document.name), 1),
    backgroundElement(document),
    ...document.layers.map((layer) => serializeLayer(layer, context, 1)),
  ].filter((child): child is string => child !== undefined)

  const root = element(
    'svg',
    {
      xmlns: SVG_NAMESPACE,
      width: sizeAttribute(document.width, document.unit),
      height: sizeAttribute(document.height, document.unit),
      viewBox: `0 0 ${formatNumber(document.width)} ${formatNumber(document.height)}`,
    },
    children,
    0,
  )
  return { text: `<?xml version="1.0" encoding="UTF-8"?>\n${root}\n`, context }
}

const validate = (text: string, parse: XmlParser | undefined): ValidationStatus => {
  if (!parse) {
    return 'not_verified'
  }
  try {
    return localName(parse(text).documentElement) === 'svg' ? 'passed' : 'failed'
  } catch {
    return 'failed'
  }
}

export type SvgWriterOptions = { readonly parse?: XmlParser }

export const createSvgWriter = (options: SvgWriterOptions = {}): DocumentWriter => ({
  id: SVG_FORMAT_ID,
  label: 'SVG',
  extensions: ['.svg'],
  mimeType: SVG_MIME_TYPE,
  capabilities: defineCapabilities('native', {
    image: 'converted',
    layers: 'converted',
    hiddenLayers: 'converted',
    lockedLayers: 'converted',
    displayP3: 'converted',
    assets: 'converted',
    metadata: 'converted',
  }),
  write(document: VectorDocument): Promise<WriteResult> {
    const { text, context } = serializeSvg(document)
    const transformations: Transformation[] = [
      { kind: 'layers_as_groups', detail: `${document.layers.length}` },
    ]
    if (document.colorSpace === 'Display-P3') {
      transformations.push({ kind: 'colors_converted', detail: 'Display-P3 → sRGB hex' })
    }
    if (Object.values(document.metadata).some((value) => value !== undefined)) {
      transformations.push({ kind: 'metadata_reduced', detail: 'title' })
    }
    if (context.skipped.length > 0) {
      transformations.push({ kind: 'objects_skipped', detail: context.skipped.join(', ') })
    }
    return Promise.resolve({
      blob: bytesToBlob(encodeText(text), SVG_MIME_TYPE),
      processedObjects: context.processed,
      skippedObjects: context.skipped.length,
      transformations,
      validation: validate(text, options.parse),
    })
  },
})

export const svgWriter = createSvgWriter()
