import { formatColor, parseColor } from '@/core/color'
import {
  createDocument,
  parseDocument,
  type AssetReference,
  type FontDescription,
  type Layer,
  type PaintStyle,
  type VectorDocument,
  type VectorNode,
} from '@/core/document'
import {
  closePath,
  identityMatrix,
  lineTo,
  moveTo,
  multiply,
  scaling,
  translation,
  type Matrix2D,
  type PathCommand,
} from '@/core/geometry'
import { err, ok, type Result } from '@/core/result'
import {
  decodeText,
  type DocumentReader,
  type FormatWarning,
  type FormatWarningCode,
  type ImportFailure,
  type ImportResult,
  type ReadInput,
} from '../types'
import { absoluteUnitFactors, parseLength, parseNumberList, type SvgLength } from './numbers'
import { parsePathData } from './path-data'
import {
  inheritStyle,
  parseOpacityAttribute,
  parsePaint,
  readStyleProperties,
  rootStyle,
  type Paint,
  type ResolvedStyle,
  type StyleProperties,
} from './style'
import { parseTransform } from './transform'
import { SVG_BACKGROUND_ROLE, SVG_FORMAT_ID, SVG_MIME_TYPE, svgDataAttributes } from './writer'
import {
  attribute,
  browserXmlParser,
  elementChildren,
  hrefAttribute,
  localName,
  textContent,
  type XmlParser,
} from './xml'

const DEFAULT_WIDTH = 300
const DEFAULT_HEIGHT = 150
const FALLBACK_PAINT = '#808080'
const MAX_DETAIL_ITEMS = 8
const physicalUnits = new Set(['mm', 'cm', 'in', 'pt'])
const ignoredElements = new Set([
  'defs',
  'title',
  'desc',
  'metadata',
  'style',
  'linearGradient',
  'radialGradient',
])
const effectAttributes = [
  'clip-path',
  'mask',
  'filter',
  'marker-start',
  'marker-mid',
  'marker-end',
  'mix-blend-mode',
]

class WarningCollector {
  readonly #subjects = new Map<FormatWarningCode, Set<string>>()

  add(code: FormatWarningCode, subject?: string): void {
    const subjects = this.#subjects.get(code) ?? new Set<string>()
    if (subject !== undefined) {
      subjects.add(subject)
    }
    this.#subjects.set(code, subjects)
  }

  list(): FormatWarning[] {
    return [...this.#subjects.entries()].map(([code, subjects]) => {
      const items = [...subjects]
      const detail =
        items.length > MAX_DETAIL_ITEMS
          ? `${items.slice(0, MAX_DETAIL_ITEMS).join(', ')} (+${items.length - MAX_DETAIL_ITEMS})`
          : items.join(', ')
      return detail ? { code, detail } : { code }
    })
  }
}

type Viewport = {
  readonly width: number
  readonly height: number
  readonly unit: VectorDocument['unit']
  readonly viewBoxWidth: number
  readonly viewBoxHeight: number
  readonly transform: Matrix2D
}

type DocumentUnit = VectorDocument['unit']

type NodeBase = {
  readonly id: string
  readonly name?: string
  readonly opacity: number
  readonly transform: Matrix2D
}

const unitOf = (length: SvgLength): DocumentUnit | undefined =>
  physicalUnits.has(length.unit) ? (length.unit as DocumentUnit) : undefined

const toPixels = (length: SvgLength): number =>
  length.value * (absoluteUnitFactors[length.unit] ?? 1)

const collapseWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim()

const describeHref = (href: string): string =>
  href.startsWith('data:') ? `${href.slice(0, href.indexOf(',') + 1 || 32)}…` : href

const mimeTypeOf = (href: string): string => {
  const dataMatch = /^data:([^;,]+)/.exec(href)
  if (dataMatch?.[1]) {
    return dataMatch[1]
  }
  const extension = href.split(/[?#]/)[0]?.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return SVG_MIME_TYPE
    default:
      return 'image/png'
  }
}

class SvgImporter {
  readonly #warnings = new WarningCollector()
  readonly #usedIds = new Set<string>()
  readonly #gradients = new Map<string, string>()
  readonly #patterns = new Set<string>()
  readonly #assets: AssetReference[] = []
  readonly #root: Element
  readonly #fallbackName: string
  #background: string | null = null
  #viewport: Viewport
  #counter = 0

  constructor(root: Element, fallbackName: string) {
    this.#root = root
    this.#fallbackName = fallbackName
    this.#viewport = this.#resolveViewport()
  }

  import(): Result<ImportResult, ImportFailure> {
    this.#scanDefinitions(this.#root)
    const layers = this.#readLayers()
    const name = elementChildren(this.#root)
      .filter((child) => localName(child) === 'title')
      .map((child) => collapseWhitespace(textContent(child)))
      .find((title) => title.length > 0)

    const document = createDocument({
      id: this.#uniqueId(undefined, 'doc'),
      name: name ?? this.#fallbackName,
      width: this.#viewport.width,
      height: this.#viewport.height,
      unit: this.#viewport.unit,
      background: this.#background,
      layers,
      assets: this.#assets,
      metadata: { createdAt: new Date().toISOString(), generator: 'vector-engine svg import' },
    })

    const validated = parseDocument(JSON.parse(JSON.stringify(document)))
    if (!validated.ok) {
      return err({ formatId: SVG_FORMAT_ID, issues: validated.error })
    }
    return ok({
      formatId: SVG_FORMAT_ID,
      document: validated.value,
      warnings: this.#warnings.list(),
    })
  }

  #resolveViewport(): Viewport {
    const width = parseLength(attribute(this.#root, 'width'))
    const height = parseLength(attribute(this.#root, 'height'))
    const viewBox = parseNumberList(attribute(this.#root, 'viewBox'))
    const hasViewBox = viewBox.length === 4 && viewBox[2]! > 0 && viewBox[3]! > 0
    const percentage = width?.unit === '%' || height?.unit === '%'
    if (percentage) {
      this.#warnings.add('svg_percentage_size')
    }
    const usableWidth = width && width.unit !== '%' ? width : undefined
    const usableHeight = height && height.unit !== '%' ? height : undefined

    if (hasViewBox) {
      const [minX, minY, viewBoxWidth, viewBoxHeight] = viewBox as [number, number, number, number]
      const unit = this.#documentUnit(usableWidth, usableHeight)
      const factor = unit === 'px' ? 1 : (absoluteUnitFactors[unit] ?? 1)
      const toDocument = (length: SvgLength | undefined): number | undefined =>
        length === undefined ? undefined : toPixels(length) / factor
      const ratio = viewBoxWidth / viewBoxHeight
      const resolvedWidth =
        toDocument(usableWidth) ?? (usableHeight ? toDocument(usableHeight)! * ratio : viewBoxWidth)
      const resolvedHeight =
        toDocument(usableHeight) ?? (usableWidth ? resolvedWidth / ratio : viewBoxHeight)
      const transform = this.#viewBoxTransform(
        minX,
        minY,
        viewBoxWidth,
        viewBoxHeight,
        resolvedWidth,
        resolvedHeight,
      )
      return {
        width: resolvedWidth,
        height: resolvedHeight,
        unit,
        viewBoxWidth,
        viewBoxHeight,
        transform,
      }
    }

    if (usableWidth && usableHeight) {
      const unit = this.#documentUnit(usableWidth, usableHeight)
      const factor = unit === 'px' ? 1 : (absoluteUnitFactors[unit] ?? 1)
      const resolvedWidth = toPixels(usableWidth) / factor
      const resolvedHeight = toPixels(usableHeight) / factor
      return {
        width: resolvedWidth,
        height: resolvedHeight,
        unit,
        viewBoxWidth: toPixels(usableWidth),
        viewBoxHeight: toPixels(usableHeight),
        transform: factor === 1 ? identityMatrix : scaling(1 / factor),
      }
    }

    this.#warnings.add('svg_default_size')
    return {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      unit: 'px',
      viewBoxWidth: DEFAULT_WIDTH,
      viewBoxHeight: DEFAULT_HEIGHT,
      transform: identityMatrix,
    }
  }

  #documentUnit(width: SvgLength | undefined, height: SvgLength | undefined): DocumentUnit {
    const widthUnit = width ? unitOf(width) : undefined
    const heightUnit = height ? unitOf(height) : undefined
    return widthUnit && widthUnit === heightUnit ? widthUnit : 'px'
  }

  #viewBoxTransform(
    minX: number,
    minY: number,
    viewBoxWidth: number,
    viewBoxHeight: number,
    width: number,
    height: number,
  ): Matrix2D {
    const preserve = (attribute(this.#root, 'preserveAspectRatio') ?? 'xMidYMid meet').trim()
    const scaleX = width / viewBoxWidth
    const scaleY = height / viewBoxHeight
    if (preserve === 'none') {
      return multiply(scaling(scaleX, scaleY), translation(-minX, -minY))
    }
    if (preserve !== 'xMidYMid meet' && preserve !== 'xMidYMid') {
      this.#warnings.add('svg_preserve_aspect_ratio', preserve)
    }
    const scale = Math.min(scaleX, scaleY)
    const offsetX = (width - viewBoxWidth * scale) / 2
    const offsetY = (height - viewBoxHeight * scale) / 2
    return multiply(
      multiply(translation(offsetX, offsetY), scaling(scale)),
      translation(-minX, -minY),
    )
  }

  #scanDefinitions(element: Element): void {
    for (const child of elementChildren(element)) {
      const name = localName(child)
      const id = attribute(child, 'id')
      if ((name === 'linearGradient' || name === 'radialGradient') && id) {
        const stop = elementChildren(child).find((candidate) => localName(candidate) === 'stop')
        const color = stop ? this.#stopColor(stop) : undefined
        this.#gradients.set(id, color ?? FALLBACK_PAINT)
      } else if (name === 'pattern' && id) {
        this.#patterns.add(id)
      } else if (name === 'style' && collapseWhitespace(textContent(child)).length > 0) {
        this.#warnings.add('svg_css_ignored')
      }
      this.#scanDefinitions(child)
    }
  }

  #stopColor(stop: Element): string | undefined {
    const declared = this.#styleDeclaration(stop, 'stop-color') ?? attribute(stop, 'stop-color')
    const paint = parsePaint(declared)
    const color = paint?.kind === 'color' ? parseColor(paint.color) : undefined
    if (!color) {
      return undefined
    }
    const opacity = parseOpacityAttribute(
      this.#styleDeclaration(stop, 'stop-opacity') ?? attribute(stop, 'stop-opacity'),
    )
    return formatColor({ ...color, a: color.a * (opacity ?? 1) })
  }

  #styleDeclaration(element: Element, property: string): string | undefined {
    const style = attribute(element, 'style') ?? ''
    const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(style)
    return match?.[1]?.trim()
  }

  #readLayers(): Layer[] {
    const layers: Layer[] = []
    let loose: VectorNode[] = []
    const flushLoose = (): void => {
      if (loose.length > 0) {
        layers.push(this.#layer(undefined, loose, {}))
        loose = []
      }
    }
    for (const child of elementChildren(this.#root)) {
      const name = localName(child)
      if (name === 'g') {
        flushLoose()
        layers.push(this.#readLayer(child))
        continue
      }
      if (name === 'rect' && attribute(child, svgDataAttributes.role) === SVG_BACKGROUND_ROLE) {
        this.#background = this.#backgroundColor(child)
        continue
      }
      const node = this.#convertElement(child, rootStyle, this.#viewport.transform)
      if (node) {
        loose.push(node)
      }
    }
    flushLoose()
    return layers
  }

  #backgroundColor(element: Element): string | null {
    const properties = readStyleProperties(element, rootStyle)
    const paint = properties.fill
    const color = paint?.kind === 'color' ? parseColor(paint.color) : undefined
    return color ? formatColor({ ...color, a: color.a * (properties.fillOpacity ?? 1) }) : null
  }

  #readLayer(element: Element): Layer {
    const properties = readStyleProperties(element, rootStyle)
    const style = inheritStyle(rootStyle, properties)
    this.#noteIgnoredAttributes(element, properties, attribute(element, 'id'))
    const transform = this.#readTransform(element, attribute(element, 'id'))
    const layerTransform = multiply(this.#viewport.transform, transform)
    const children = elementChildren(element)
      .map((child) => this.#convertElement(child, style, layerTransform))
      .filter((node): node is VectorNode => node !== undefined)
    return this.#layer(element, children, properties)
  }

  #layer(element: Element | undefined, children: VectorNode[], properties: StyleProperties): Layer {
    const index = this.#counter + 1
    const name =
      (element &&
        (attribute(element, svgDataAttributes.layer) ?? attribute(element, 'inkscape:label'))) ??
      `Layer ${index}`
    return {
      id: this.#uniqueId(element ? attribute(element, 'id') : undefined, 'layer'),
      name,
      visible: properties.display !== 'none' && properties.visibility !== 'hidden',
      locked: element ? attribute(element, svgDataAttributes.locked) === 'true' : false,
      opacity: properties.opacity ?? 1,
      children,
    }
  }

  #uniqueId(preferred: string | undefined, prefix: string): string {
    const candidate = preferred?.trim()
    if (candidate && !this.#usedIds.has(candidate)) {
      this.#usedIds.add(candidate)
      return candidate
    }
    if (candidate) {
      this.#warnings.add('svg_duplicate_ids', candidate)
    }
    let generated: string
    do {
      this.#counter += 1
      generated = candidate ? `${candidate}-${this.#counter}` : `${prefix}_${this.#counter}`
    } while (this.#usedIds.has(generated))
    this.#usedIds.add(generated)
    return generated
  }

  #readTransform(element: Element, subject: string | undefined): Matrix2D {
    const parsed = parseTransform(attribute(element, 'transform'))
    if (parsed.malformed) {
      this.#warnings.add('svg_transform_ignored', subject ?? localName(element))
    }
    return parsed.matrix
  }

  #noteIgnoredAttributes(
    element: Element,
    properties: StyleProperties,
    subject: string | undefined,
  ): void {
    const label = subject ?? localName(element)
    const effects = effectAttributes.filter(
      (name) =>
        attribute(element, name) !== undefined ||
        this.#styleDeclaration(element, name) !== undefined,
    )
    if (effects.length > 0) {
      this.#warnings.add('svg_effects_ignored', `${label} (${effects.join(', ')})`)
    }
    if (properties.strokeDasharray && properties.strokeDasharray !== 'none') {
      this.#warnings.add('svg_dash_pattern_ignored', label)
    }
    const join = properties.strokeLinejoin
    const cap = properties.strokeLinecap
    if ((join && join !== 'round') || (cap && cap !== 'round')) {
      this.#warnings.add('svg_stroke_style_normalized', label)
    }
  }

  #convertElement(
    element: Element,
    parentStyle: ResolvedStyle,
    inherited: Matrix2D,
  ): VectorNode | undefined {
    const name = localName(element)
    if (ignoredElements.has(name)) {
      return undefined
    }
    const subject = attribute(element, 'id') ?? name
    const properties = readStyleProperties(element, parentStyle)
    const style = inheritStyle(parentStyle, properties)
    if (properties.display === 'none' || style.visibility === 'hidden') {
      this.#warnings.add('svg_hidden_elements_omitted', subject)
      return undefined
    }
    this.#noteIgnoredAttributes(element, properties, attribute(element, 'id'))
    const transform = multiply(inherited, this.#readTransform(element, attribute(element, 'id')))
    const nodeName = attribute(element, svgDataAttributes.name)
    const base: NodeBase = {
      id: this.#uniqueId(attribute(element, 'id'), name),
      ...(nodeName ? { name: nodeName } : {}),
      opacity: properties.opacity ?? 1,
      transform,
    }

    switch (name) {
      case 'g':
      case 'a':
      case 'switch':
        return {
          ...base,
          type: 'group',
          children: elementChildren(element)
            .map((child) => this.#convertElement(child, style, identityMatrix))
            .filter((node): node is VectorNode => node !== undefined),
        }
      case 'rect':
        return this.#rectangle(element, base, style)
      case 'circle':
        return this.#ellipse(element, base, style, true)
      case 'ellipse':
        return this.#ellipse(element, base, style, false)
      case 'line':
        return this.#line(element, base, style)
      case 'polyline':
      case 'polygon':
        return this.#polygon(element, base, style, name === 'polygon')
      case 'path':
        return this.#path(element, base, style)
      case 'text':
        return this.#text(element, base, style)
      case 'image':
        return this.#image(element, base)
      default:
        this.#warnings.add('svg_unsupported_elements', name)
        return undefined
    }
  }

  #length(element: Element, name: string, axis: 'x' | 'y', fallback = 0): number {
    const length = parseLength(attribute(element, name))
    if (!length) {
      return fallback
    }
    if (length.unit === '%') {
      const reference = axis === 'x' ? this.#viewport.viewBoxWidth : this.#viewport.viewBoxHeight
      return (length.value / 100) * reference
    }
    if (length.unit === 'em' || length.unit === 'ex' || length.unit === 'rem') {
      this.#warnings.add('svg_relative_units', attribute(element, 'id') ?? localName(element))
      return length.value * 16
    }
    return toPixels(length)
  }

  #paintStyle(style: ResolvedStyle, subject: string, allowFill = true): PaintStyle {
    const fill = allowFill
      ? this.#resolvePaint(style.fill, style, style.fillOpacity, subject)
      : undefined
    const stroke = this.#resolvePaint(style.stroke, style, style.strokeOpacity, subject)
    return {
      ...(fill ? { fill: { color: fill } } : {}),
      ...(stroke && style.strokeWidth > 0
        ? { stroke: { color: stroke, width: style.strokeWidth } }
        : {}),
    }
  }

  #resolvePaint(
    paint: Paint,
    style: ResolvedStyle,
    opacity: number,
    subject: string,
  ): string | undefined {
    let color: string | undefined
    switch (paint.kind) {
      case 'none':
        return undefined
      case 'color':
        color = paint.color
        break
      case 'currentColor':
        color = style.color
        break
      case 'reference': {
        const gradient = this.#gradients.get(paint.id)
        if (gradient) {
          this.#warnings.add('svg_gradient_flattened', subject)
          color = gradient
        } else {
          this.#warnings.add('svg_paint_server_unsupported', `${subject} (#${paint.id})`)
          color = FALLBACK_PAINT
        }
        break
      }
      case 'invalid':
        this.#warnings.add('svg_invalid_paint', `${subject} (${paint.raw})`)
        color = FALLBACK_PAINT
        break
    }
    const parsed = parseColor(color)
    return parsed ? formatColor({ ...parsed, a: parsed.a * opacity }) : undefined
  }

  #rectangle(element: Element, base: NodeBase, style: ResolvedStyle): VectorNode | undefined {
    const width = this.#length(element, 'width', 'x')
    const height = this.#length(element, 'height', 'y')
    if (width <= 0 || height <= 0) {
      this.#warnings.add('svg_degenerate_elements_omitted', base.id)
      return undefined
    }
    const rx = parseLength(attribute(element, 'rx'))
    const ry = parseLength(attribute(element, 'ry'))
    const radiusX = rx ? this.#length(element, 'rx', 'x') : undefined
    const radiusY = ry ? this.#length(element, 'ry', 'y') : undefined
    const radius = radiusX ?? radiusY ?? 0
    if (radiusX !== undefined && radiusY !== undefined && Math.abs(radiusX - radiusY) > 1e-9) {
      this.#warnings.add('svg_elliptical_corners', base.id)
    }
    return {
      ...base,
      type: 'rectangle',
      x: this.#length(element, 'x', 'x'),
      y: this.#length(element, 'y', 'y'),
      width,
      height,
      cornerRadius: Math.min(Math.max(radius, 0), width / 2, height / 2),
      style: this.#paintStyle(style, base.id),
    }
  }

  #ellipse(
    element: Element,
    base: NodeBase,
    style: ResolvedStyle,
    circle: boolean,
  ): VectorNode | undefined {
    const rx = circle ? this.#length(element, 'r', 'x') : this.#length(element, 'rx', 'x')
    const ry = circle ? rx : this.#length(element, 'ry', 'y')
    if (rx <= 0 || ry <= 0) {
      this.#warnings.add('svg_degenerate_elements_omitted', base.id)
      return undefined
    }
    return {
      ...base,
      type: 'ellipse',
      cx: this.#length(element, 'cx', 'x'),
      cy: this.#length(element, 'cy', 'y'),
      rx,
      ry,
      style: this.#paintStyle(style, base.id),
    }
  }

  #line(element: Element, base: NodeBase, style: ResolvedStyle): VectorNode {
    return {
      ...base,
      type: 'path',
      geometry: {
        commands: [
          moveTo(this.#length(element, 'x1', 'x'), this.#length(element, 'y1', 'y')),
          lineTo(this.#length(element, 'x2', 'x'), this.#length(element, 'y2', 'y')),
        ],
        fillRule: 'nonzero',
      },
      style: this.#paintStyle(style, base.id, false),
    }
  }

  #polygon(
    element: Element,
    base: NodeBase,
    style: ResolvedStyle,
    closed: boolean,
  ): VectorNode | undefined {
    const numbers = parseNumberList(attribute(element, 'points'))
    const commands: PathCommand[] = []
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      const x = numbers[index]!
      const y = numbers[index + 1]!
      commands.push(index === 0 ? moveTo(x, y) : lineTo(x, y))
    }
    if (commands.length < 2) {
      this.#warnings.add('svg_degenerate_elements_omitted', base.id)
      return undefined
    }
    if (closed) {
      commands.push(closePath())
    }
    return {
      ...base,
      type: 'path',
      geometry: { commands, fillRule: style.fillRule },
      style: this.#paintStyle(style, base.id),
    }
  }

  #path(element: Element, base: NodeBase, style: ResolvedStyle): VectorNode | undefined {
    let commands: PathCommand[]
    try {
      commands = parsePathData(attribute(element, 'd') ?? '')
    } catch {
      this.#warnings.add('svg_degenerate_elements_omitted', base.id)
      return undefined
    }
    if (commands.length === 0) {
      this.#warnings.add('svg_degenerate_elements_omitted', base.id)
      return undefined
    }
    return {
      ...base,
      type: 'path',
      geometry: { commands, fillRule: style.fillRule },
      style: this.#paintStyle(style, base.id),
    }
  }

  #text(element: Element, base: NodeBase, style: ResolvedStyle): VectorNode | undefined {
    const spans = elementChildren(element)
    if (
      spans.some((span) =>
        ['x', 'y', 'dx', 'dy'].some((name) => attribute(span, name) !== undefined),
      )
    ) {
      this.#warnings.add('svg_text_spans_flattened', base.id)
    }
    const anchor =
      attribute(element, 'text-anchor') ?? this.#styleDeclaration(element, 'text-anchor')
    if (anchor && anchor !== 'start') {
      this.#warnings.add('svg_text_layout_ignored', base.id)
    }
    const preserve = attribute(element, 'xml:space') === 'preserve'
    const raw = textContent(element)
    const content = preserve ? raw : collapseWhitespace(raw)
    if (content.length === 0) {
      this.#warnings.add('svg_degenerate_elements_omitted', base.id)
      return undefined
    }
    const font: FontDescription = {
      family: style.fontFamily,
      size: style.fontSize > 0 ? style.fontSize : rootStyle.fontSize,
      weight: style.fontWeight,
      style: style.fontStyle,
    }
    return {
      ...base,
      type: 'text',
      x: parseNumberList(attribute(element, 'x'))[0] ?? 0,
      y: parseNumberList(attribute(element, 'y'))[0] ?? 0,
      content,
      font,
      style: this.#paintStyle(style, base.id),
    }
  }

  #image(element: Element, base: NodeBase): VectorNode | undefined {
    const href = hrefAttribute(element)
    const width = this.#length(element, 'width', 'x')
    const height = this.#length(element, 'height', 'y')
    if (!href || width <= 0 || height <= 0) {
      this.#warnings.add('svg_degenerate_elements_omitted', base.id)
      return undefined
    }
    const asset: AssetReference = {
      id: this.#uniqueId(undefined, 'asset'),
      kind: 'image',
      path: href,
      mimeType: mimeTypeOf(href),
      name: base.id,
    }
    this.#assets.push(asset)
    this.#warnings.add('svg_external_assets', describeHref(href))
    return {
      ...base,
      type: 'image',
      x: this.#length(element, 'x', 'x'),
      y: this.#length(element, 'y', 'y'),
      width,
      height,
      assetId: asset.id,
    }
  }
}

const looksLikeSvg = (bytes: Uint8Array): boolean =>
  /<svg[\s>]/i.test(decodeText(bytes.subarray(0, 4096)))

export const createSvgReader = (parse: XmlParser = browserXmlParser): DocumentReader => ({
  id: SVG_FORMAT_ID,
  label: 'SVG',
  extensions: ['.svg'],
  mimeType: SVG_MIME_TYPE,
  matches: (input: ReadInput) => looksLikeSvg(input.bytes),
  read(input: ReadInput): Promise<Result<ImportResult, ImportFailure>> {
    let root: Element
    try {
      root = parse(decodeText(input.bytes)).documentElement
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Malformed XML'
      return Promise.resolve(err({ formatId: SVG_FORMAT_ID, issues: [{ path: '', message }] }))
    }
    if (!root || localName(root) !== 'svg') {
      return Promise.resolve(
        err({
          formatId: SVG_FORMAT_ID,
          issues: [{ path: '', message: 'Root element is not <svg>' }],
        }),
      )
    }
    const name = input.fileName.replace(/\.svg$/i, '') || 'Imported SVG'
    return Promise.resolve(new SvgImporter(root, name).import())
  },
})

export const svgReader = createSvgReader()
