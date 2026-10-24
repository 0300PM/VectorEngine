import { collectAllGradients, extractScopedScene, resolveExportViewport } from '@/export/bounds'
import type { RenderOptions } from '@/types/engine'
import type {
  CommonObject,
  SceneGradient,
  SceneObject,
  Transform,
  VectorScene,
} from '@/types/scene'

const formatNumber = (value: number, compact = false): string => {
  if (Object.is(value, -0) || Math.abs(value) < 1e-12) {
    return '0'
  }
  if (Number.isInteger(value)) {
    return String(value)
  }
  return Number(value.toFixed(compact ? 4 : 6)).toString()
}

const shortenColor = (value: string, compact: boolean): string => {
  if (!compact || !/^#[0-9a-f]{6}$/i.test(value)) {
    return value
  }
  const upper = value.toUpperCase()
  if (upper[1] === upper[2] && upper[3] === upper[4] && upper[5] === upper[6]) {
    return `#${upper[1]}${upper[3]}${upper[5]}`
  }
  return upper
}

const compactPath = (d: string): string => d
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\s*([MmLlHhVvCcSsQqTtAaZz,])\s*/g, '$1')

const escapeAttribute = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const escapeText = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const transformValue = (transform: Transform, compact: boolean): string => {
  const parts: string[] = []
  const translateX = transform.translateX ?? 0
  const translateY = transform.translateY ?? 0
  const originX = transform.originX ?? 0
  const originY = transform.originY ?? 0
  const hasOrigin = originX !== 0 || originY !== 0

  if (translateX !== 0 || translateY !== 0) {
    parts.push(`translate(${formatNumber(translateX, compact)} ${formatNumber(translateY, compact)})`)
  }
  if (hasOrigin) {
    parts.push(`translate(${formatNumber(originX, compact)} ${formatNumber(originY, compact)})`)
  }
  if (transform.rotate !== undefined && transform.rotate !== 0) {
    parts.push(`rotate(${formatNumber(transform.rotate, compact)})`)
  }
  if (transform.skewX !== undefined && transform.skewX !== 0) {
    parts.push(`skewX(${formatNumber(transform.skewX, compact)})`)
  }
  if (transform.skewY !== undefined && transform.skewY !== 0) {
    parts.push(`skewY(${formatNumber(transform.skewY, compact)})`)
  }
  const scaleX = transform.scaleX ?? 1
  const scaleY = transform.scaleY ?? scaleX
  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${formatNumber(scaleX, compact)} ${formatNumber(scaleY, compact)})`)
  }
  if (hasOrigin) {
    parts.push(`translate(${formatNumber(-originX, compact)} ${formatNumber(-originY, compact)})`)
  }

  return parts.join(' ')
}

const commonAttributes = (
  object: CommonObject,
  defaults: { fill?: string; stroke?: string } = {},
  compact = false,
): string => {
  const attributes: string[] = [`id="${escapeAttribute(object.id)}"`]
  const fill = object.fill ?? defaults.fill
  const stroke = object.stroke ?? defaults.stroke

  if (fill !== undefined) {
    attributes.push(`fill="${escapeAttribute(shortenColor(fill, compact))}"`)
  }
  if (stroke !== undefined && (!compact || stroke !== 'none')) {
    attributes.push(`stroke="${escapeAttribute(shortenColor(stroke, compact))}"`)
  }
  if (object.strokeWidth !== undefined) {
    attributes.push(`stroke-width="${formatNumber(object.strokeWidth, compact)}"`)
  }
  if (object.opacity !== undefined && (!compact || object.opacity < 1)) {
    attributes.push(`opacity="${formatNumber(object.opacity, compact)}"`)
  }
  if (object.blendMode && object.blendMode !== 'normal') {
    attributes.push(`style="mix-blend-mode:${escapeAttribute(object.blendMode)}"`)
  }
  if (object.transform) {
    const value = transformValue(object.transform, compact)
    if (value) {
      attributes.push(`transform="${value}"`)
    }
  }

  return attributes.join(' ')
}

const pointsValue = (points: { x: number; y: number }[], compact: boolean): string => points
  .map((point) => `${formatNumber(point.x, compact)},${formatNumber(point.y, compact)}`)
  .join(' ')

const renderGradientDef = (gradient: SceneGradient, compact: boolean): string => {
  const units = gradient.gradientUnits === 'userSpaceOnUse' ? ' gradientUnits="userSpaceOnUse"' : ''
  const spread = gradient.spreadMethod && gradient.spreadMethod !== 'pad'
    ? ` spreadMethod="${gradient.spreadMethod}"`
    : ''
  const stops = gradient.stops.map((stop) => {
    const stopOpacity = stop.opacity !== undefined && stop.opacity < 1
      ? ` stop-opacity="${formatNumber(stop.opacity, compact)}"`
      : ''
    return `<stop offset="${formatNumber(stop.offset, compact)}" stop-color="${escapeAttribute(shortenColor(stop.color, compact))}"${stopOpacity}/>`
  }).join('')

  if (gradient.type === 'linear') {
    return `<linearGradient id="${escapeAttribute(gradient.id)}" x1="${formatNumber(gradient.x1 ?? 0, compact)}" y1="${formatNumber(gradient.y1 ?? 0, compact)}" x2="${formatNumber(gradient.x2 ?? 1, compact)}" y2="${formatNumber(gradient.y2 ?? 0, compact)}"${units}${spread}>${stops}</linearGradient>`
  }
  const fx = gradient.fx === undefined ? '' : ` fx="${formatNumber(gradient.fx, compact)}"`
  const fy = gradient.fy === undefined ? '' : ` fy="${formatNumber(gradient.fy, compact)}"`
  return `<radialGradient id="${escapeAttribute(gradient.id)}" cx="${formatNumber(gradient.cx ?? 0.5, compact)}" cy="${formatNumber(gradient.cy ?? 0.5, compact)}" r="${formatNumber(gradient.r ?? 0.5, compact)}"${fx}${fy}${units}${spread}>${stops}</radialGradient>`
}

const collectUsedGradients = (objects: SceneObject[], out: Set<string>): void => {
  for (const object of objects) {
    for (const paint of [object.fill, object.stroke]) {
      if (paint && paint.startsWith('url(#') && paint.endsWith(')')) {
        out.add(paint.slice(5, -1))
      }
    }
    if (object.type === 'group') {
      collectUsedGradients(object.children, out)
    }
  }
}

const renderObject = (object: SceneObject, includeHidden: boolean, compact: boolean): string => {
  if (!includeHidden && object.visible === false) {
    return ''
  }

  switch (object.type) {
    case 'rect': {
      const cornerAttributes = [
        object.rx === undefined ? '' : ` rx="${formatNumber(object.rx, compact)}"`,
        object.ry === undefined ? '' : ` ry="${formatNumber(object.ry, compact)}"`,
      ].join('')
      return `<rect ${commonAttributes(object, { fill: '#171717' }, compact)} x="${formatNumber(object.x, compact)}" y="${formatNumber(object.y, compact)}" width="${formatNumber(object.width, compact)}" height="${formatNumber(object.height, compact)}"${cornerAttributes}/>`
    }
    case 'circle':
      return `<circle ${commonAttributes(object, { fill: '#171717' }, compact)} cx="${formatNumber(object.cx, compact)}" cy="${formatNumber(object.cy, compact)}" r="${formatNumber(object.radius, compact)}"/>`
    case 'ellipse':
      return `<ellipse ${commonAttributes(object, { fill: '#171717' }, compact)} cx="${formatNumber(object.cx, compact)}" cy="${formatNumber(object.cy, compact)}" rx="${formatNumber(object.rx, compact)}" ry="${formatNumber(object.ry, compact)}"/>`
    case 'line':
      return `<line ${commonAttributes(object, { fill: 'none', stroke: '#171717' }, compact)} x1="${formatNumber(object.x1, compact)}" y1="${formatNumber(object.y1, compact)}" x2="${formatNumber(object.x2, compact)}" y2="${formatNumber(object.y2, compact)}"/>`
    case 'polygon':
      return `<polygon ${commonAttributes(object, { fill: '#171717' }, compact)} points="${pointsValue(object.points, compact)}"/>`
    case 'polyline':
      return `<polyline ${commonAttributes(object, { fill: 'none', stroke: '#171717' }, compact)} points="${pointsValue(object.points, compact)}"/>`
    case 'path': {
      const dVal = compact ? compactPath(object.d) : object.d
      const fillRuleAttr = compact && (object.fillRule ?? 'nonzero') === 'nonzero'
        ? ''
        : ` fill-rule="${object.fillRule ?? 'nonzero'}"`
      return `<path ${commonAttributes(object, { fill: '#171717' }, compact)} d="${escapeAttribute(dVal)}"${fillRuleAttr}/>`
    }
    case 'text': {
      const textAttributes = [
        `x="${formatNumber(object.x, compact)}"`,
        `y="${formatNumber(object.y, compact)}"`,
        `font-size="${formatNumber(object.fontSize ?? 16, compact)}"`,
        `font-family="${escapeAttribute(object.fontFamily ?? 'Inter, ui-sans-serif, system-ui, sans-serif')}"`,
        compact && (object.fontWeight ?? 400) === 400 ? '' : `font-weight="${object.fontWeight ?? 400}"`,
        compact && (object.textAnchor ?? 'start') === 'start' ? '' : `text-anchor="${object.textAnchor ?? 'start'}"`,
        object.letterSpacing === undefined ? '' : `letter-spacing="${formatNumber(object.letterSpacing, compact)}"`,
      ].filter(Boolean).join(' ')
      return `<text ${commonAttributes(object, { fill: '#171717' }, compact)} ${textAttributes}>${escapeText(object.content)}</text>`
    }
    case 'group': {
      const children = object.children.map((child) => renderObject(child, includeHidden, compact)).join('')
      return `<g ${commonAttributes(object, {}, compact)}>${children}</g>`
    }
  }
}

const resolveBackgroundColor = (
  scene: VectorScene,
  background: RenderOptions['background'],
): string | null => {
  if (background === undefined || background === 'document') {
    const docBg = scene.document.background
    return docBg && docBg !== 'none' ? docBg : null
  }
  if (background === null || background === 'transparent' || background === 'none') {
    return null
  }
  if (typeof background === 'object') {
    return background.color
  }
  return background
}

export const renderSceneToSvg = (scene: VectorScene, options: RenderOptions = {}): string => {
  const compact = Boolean(options.minifySvg)
  const includeHidden = Boolean(options.includeHidden)
  const scoped = extractScopedScene(scene, options.target ?? { type: 'scene' }, includeHidden)
  const viewport = resolveExportViewport(scene, scoped, options)

  const usedGradients = new Set<string>()
  for (const layer of scoped.layers ?? []) {
    collectUsedGradients(layer.objects, usedGradients)
  }
  collectUsedGradients(scoped.objects, usedGradients)

  const defsParts = collectAllGradients(scene)
    .filter((grad) => usedGradients.has(grad.id))
    .map((grad) => renderGradientDef(grad, compact))

  if (viewport.clipToBounds) {
    defsParts.push(
      `<clipPath id="ve-export-clip"><rect x="${formatNumber(viewport.sourceBox.x, compact)}" y="${formatNumber(viewport.sourceBox.y, compact)}" width="${formatNumber(viewport.sourceBox.width, compact)}" height="${formatNumber(viewport.sourceBox.height, compact)}"/></clipPath>`,
    )
  }
  const defsElement = defsParts.length > 0 ? `<defs>${defsParts.join('')}</defs>` : ''

  const bgColor = resolveBackgroundColor(scene, options.background)
  const backgroundElement = bgColor
    ? `<rect x="${formatNumber(viewport.viewBox.x, compact)}" y="${formatNumber(viewport.viewBox.y, compact)}" width="${formatNumber(viewport.viewBox.width, compact)}" height="${formatNumber(viewport.viewBox.height, compact)}" fill="${escapeAttribute(shortenColor(bgColor, compact))}"/>`
    : ''

  const layerMarkup = (scoped.layers ?? []).map((layer) => {
    const opacityAttr = layer.opacity !== undefined && layer.opacity < 1
      ? ` opacity="${formatNumber(layer.opacity, compact)}"`
      : ''
    const inner = layer.objects.map((item) => renderObject(item, true, compact)).join('')
    return `<g id="${escapeAttribute(layer.id)}" data-layer="${escapeAttribute(layer.id)}"${opacityAttr}>${inner}</g>`
  }).join('')

  const objectMarkup = scoped.objects.map((item) => renderObject(item, true, compact)).join('')
  const combinedMarkup = viewport.clipToBounds
    ? `<g clip-path="url(#ve-export-clip)">${layerMarkup}${objectMarkup}</g>`
    : `${layerMarkup}${objectMarkup}`

  const aspectAttr = viewport.fitMode === 'cover'
    ? ' preserveAspectRatio="xMidYMid slice"'
    : viewport.fitMode === 'stretch'
      ? ' preserveAspectRatio="none"'
      : ''
  const a11yAttrs = compact ? '' : ' role="img" aria-label="Vector Engine output" shape-rendering="geometricPrecision"'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(viewport.outputWidth, compact)}" height="${formatNumber(viewport.outputHeight, compact)}" viewBox="${formatNumber(viewport.viewBox.x, compact)} ${formatNumber(viewport.viewBox.y, compact)} ${formatNumber(viewport.viewBox.width, compact)} ${formatNumber(viewport.viewBox.height, compact)}"${aspectAttr}${a11yAttrs}>${defsElement}${backgroundElement}${combinedMarkup}</svg>`
}
