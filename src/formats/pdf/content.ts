import { parseColor, type Rgba } from '@/core/color'
import type {
  EllipseNode,
  Layer,
  PaintStyle,
  RectangleNode,
  TextNode,
  VectorNode,
} from '@/core/document'
import type { Matrix2D, PathCommand } from '@/core/geometry'
import { PdfFontSet } from './fonts'
import { formatPdfNumber, pdfLiteralString } from './objects'

const KAPPA = 0.5522847498307936

export type ExtGState = { readonly fillAlpha: number; readonly strokeAlpha: number }

export type ContentSummary = {
  readonly processed: number
  readonly skipped: readonly string[]
  readonly translucentGroups: readonly string[]
  readonly replacedCharacters: readonly string[]
  readonly fonts: PdfFontSet
  readonly extGStates: ReadonlyMap<string, ExtGState>
}

type ResolvedPaint = {
  readonly fill?: Rgba
  readonly stroke?: { readonly color: Rgba; readonly width: number }
}

const n = formatPdfNumber

const matrixOperator = (matrix: Matrix2D): string =>
  `${n(matrix.a)} ${n(matrix.b)} ${n(matrix.c)} ${n(matrix.d)} ${n(matrix.e)} ${n(matrix.f)} cm`

const colorOperands = (color: Rgba): string => `${n(color.r)} ${n(color.g)} ${n(color.b)}`

const resolvePaint = (style: PaintStyle): ResolvedPaint => {
  const fill = style.fill ? parseColor(style.fill.color) : undefined
  const strokeColor =
    style.stroke && style.stroke.width > 0 ? parseColor(style.stroke.color) : undefined
  return {
    ...(fill && fill.a > 0 ? { fill } : {}),
    ...(strokeColor && strokeColor.a > 0 && style.stroke
      ? { stroke: { color: strokeColor, width: style.stroke.width } }
      : {}),
  }
}

const roundedRectangle = (node: RectangleNode): string[] => {
  const radius = Math.min(node.cornerRadius, node.width / 2, node.height / 2)
  if (radius <= 0) {
    return [`${n(node.x)} ${n(node.y)} ${n(node.width)} ${n(node.height)} re`]
  }
  const k = radius * KAPPA
  const left = node.x
  const top = node.y
  const right = node.x + node.width
  const bottom = node.y + node.height
  return [
    `${n(left + radius)} ${n(top)} m`,
    `${n(right - radius)} ${n(top)} l`,
    `${n(right - radius + k)} ${n(top)} ${n(right)} ${n(top + radius - k)} ${n(right)} ${n(top + radius)} c`,
    `${n(right)} ${n(bottom - radius)} l`,
    `${n(right)} ${n(bottom - radius + k)} ${n(right - radius + k)} ${n(bottom)} ${n(right - radius)} ${n(bottom)} c`,
    `${n(left + radius)} ${n(bottom)} l`,
    `${n(left + radius - k)} ${n(bottom)} ${n(left)} ${n(bottom - radius + k)} ${n(left)} ${n(bottom - radius)} c`,
    `${n(left)} ${n(top + radius)} l`,
    `${n(left)} ${n(top + radius - k)} ${n(left + radius - k)} ${n(top)} ${n(left + radius)} ${n(top)} c`,
    'h',
  ]
}

const ellipsePath = (node: EllipseNode): string[] => {
  const kx = node.rx * KAPPA
  const ky = node.ry * KAPPA
  const { cx, cy, rx, ry } = node
  return [
    `${n(cx + rx)} ${n(cy)} m`,
    `${n(cx + rx)} ${n(cy + ky)} ${n(cx + kx)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)} c`,
    `${n(cx - kx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + ky)} ${n(cx - rx)} ${n(cy)} c`,
    `${n(cx - rx)} ${n(cy - ky)} ${n(cx - kx)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)} c`,
    `${n(cx + kx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - ky)} ${n(cx + rx)} ${n(cy)} c`,
    'h',
  ]
}

const pathOperators = (commands: readonly PathCommand[]): string[] => {
  const operators: string[] = []
  let current = { x: 0, y: 0 }
  let start = current
  let open = false
  for (const command of commands) {
    switch (command.type) {
      case 'M':
        current = { x: command.x, y: command.y }
        start = current
        open = true
        operators.push(`${n(command.x)} ${n(command.y)} m`)
        break
      case 'L':
        if (!open) {
          operators.push(`${n(current.x)} ${n(current.y)} m`)
          start = current
          open = true
        }
        current = { x: command.x, y: command.y }
        operators.push(`${n(command.x)} ${n(command.y)} l`)
        break
      case 'Q': {
        if (!open) {
          operators.push(`${n(current.x)} ${n(current.y)} m`)
          start = current
          open = true
        }
        const x1 = current.x + (2 / 3) * (command.x1 - current.x)
        const y1 = current.y + (2 / 3) * (command.y1 - current.y)
        const x2 = command.x + (2 / 3) * (command.x1 - command.x)
        const y2 = command.y + (2 / 3) * (command.y1 - command.y)
        current = { x: command.x, y: command.y }
        operators.push(`${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(command.x)} ${n(command.y)} c`)
        break
      }
      case 'C':
        if (!open) {
          operators.push(`${n(current.x)} ${n(current.y)} m`)
          start = current
          open = true
        }
        current = { x: command.x, y: command.y }
        operators.push(
          `${n(command.x1)} ${n(command.y1)} ${n(command.x2)} ${n(command.y2)} ${n(command.x)} ${n(command.y)} c`,
        )
        break
      case 'Z':
        if (open) {
          operators.push('h')
          current = start
          open = false
        }
        break
    }
  }
  return operators
}

const paintOperator = (paint: ResolvedPaint, evenOdd: boolean): string => {
  if (paint.fill && paint.stroke) {
    return evenOdd ? 'B*' : 'B'
  }
  if (paint.fill) {
    return evenOdd ? 'f*' : 'f'
  }
  return paint.stroke ? 'S' : 'n'
}

export class ContentStreamBuilder {
  readonly #operators: string[] = []
  readonly #extGStates = new Map<string, ExtGState>()
  readonly #extGStateNames = new Map<string, string>()
  readonly #fonts = new PdfFontSet()
  readonly #skipped: string[] = []
  readonly #translucentGroups: string[] = []
  readonly #replaced = new Set<string>()
  #processed = 0

  constructor(scale: number, pageHeight: number) {
    this.#operators.push(`${n(scale)} 0 0 ${n(-scale)} 0 ${n(pageHeight)} cm`)
  }

  background(color: Rgba, width: number, height: number): void {
    this.#operators.push('q')
    this.#graphicsState(color.a, 1)
    this.#operators.push(`${colorOperands(color)} rg`, `0 0 ${n(width)} ${n(height)} re`, 'f', 'Q')
  }

  layer(layer: Layer): void {
    for (const node of layer.children) {
      this.node(node, layer.opacity)
    }
  }

  node(node: VectorNode, inheritedOpacity: number): void {
    const opacity = inheritedOpacity * node.opacity
    switch (node.type) {
      case 'group':
        if (node.opacity < 1) {
          this.#translucentGroups.push(node.id)
        }
        this.#processed += 1
        this.#operators.push('q', matrixOperator(node.transform))
        for (const child of node.children) {
          this.node(child, opacity)
        }
        this.#operators.push('Q')
        return
      case 'image':
        this.#skipped.push(node.id)
        return
      case 'rectangle':
        this.#shape(node.transform, roundedRectangle(node), node.style, false, opacity)
        return
      case 'ellipse':
        this.#shape(node.transform, ellipsePath(node), node.style, false, opacity)
        return
      case 'path':
        this.#shape(
          node.transform,
          pathOperators(node.geometry.commands),
          node.style,
          node.geometry.fillRule === 'evenodd',
          opacity,
        )
        return
      case 'text':
        this.#text(node, opacity)
        return
    }
  }

  finish(): { readonly content: string; readonly summary: ContentSummary } {
    return {
      content: this.#operators.join('\n'),
      summary: {
        processed: this.#processed,
        skipped: this.#skipped,
        translucentGroups: this.#translucentGroups,
        replacedCharacters: [...this.#replaced],
        fonts: this.#fonts,
        extGStates: this.#extGStates,
      },
    }
  }

  #graphicsState(fillAlpha: number, strokeAlpha: number): void {
    const fill = Math.min(1, Math.max(0, fillAlpha))
    const stroke = Math.min(1, Math.max(0, strokeAlpha))
    if (fill >= 1 && stroke >= 1) {
      return
    }
    const key = `${n(fill)}|${n(stroke)}`
    let name = this.#extGStateNames.get(key)
    if (!name) {
      name = `GS${this.#extGStates.size + 1}`
      this.#extGStateNames.set(key, name)
      this.#extGStates.set(name, { fillAlpha: fill, strokeAlpha: stroke })
    }
    this.#operators.push(`/${name} gs`)
  }

  #paintSetup(paint: ResolvedPaint, opacity: number): void {
    this.#graphicsState(opacity * (paint.fill?.a ?? 1), opacity * (paint.stroke?.color.a ?? 1))
    if (paint.fill) {
      this.#operators.push(`${colorOperands(paint.fill)} rg`)
    }
    if (paint.stroke) {
      this.#operators.push(
        `${colorOperands(paint.stroke.color)} RG`,
        `${n(paint.stroke.width)} w`,
        '1 J',
        '1 j',
      )
    }
  }

  #shape(
    transform: Matrix2D,
    geometry: readonly string[],
    style: PaintStyle,
    evenOdd: boolean,
    opacity: number,
  ): void {
    this.#processed += 1
    const paint = resolvePaint(style)
    if ((!paint.fill && !paint.stroke) || geometry.length === 0) {
      return
    }
    this.#operators.push('q', matrixOperator(transform))
    this.#paintSetup(paint, opacity)
    this.#operators.push(...geometry, paintOperator(paint, evenOdd), 'Q')
  }

  #text(node: TextNode, opacity: number): void {
    this.#processed += 1
    const paint = resolvePaint(node.style)
    if (!paint.fill && !paint.stroke) {
      return
    }
    const font = this.#fonts.resolve(node.font)
    const encoded = font.encode(node.content)
    encoded.replaced.forEach((character) => this.#replaced.add(character))
    const renderMode = paint.fill && paint.stroke ? 2 : paint.fill ? 0 : 1
    this.#operators.push('q', matrixOperator(node.transform))
    this.#paintSetup(paint, opacity)
    this.#operators.push(
      'BT',
      `/${font.resourceName} ${n(node.font.size)} Tf`,
      `${renderMode} Tr`,
      `1 0 0 -1 ${n(node.x)} ${n(node.y)} Tm`,
      `${pdfLiteralString(encoded.bytes)} Tj`,
      'ET',
      'Q',
    )
  }
}
