import type { RenderOptions } from '@/types/engine'
import type { CommonObject, SceneObject, Transform, VectorScene } from '@/types/scene'

const formatNumber = (value: number): string => {
  if (Object.is(value, -0)) {
    return '0'
  }
  if (Number.isInteger(value)) {
    return String(value)
  }
  return Number(value.toFixed(6)).toString()
}

const escapeAttribute = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const escapeText = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const transformValue = (transform: Transform): string => {
  const parts: string[] = []
  const translateX = transform.translateX ?? 0
  const translateY = transform.translateY ?? 0
  const originX = transform.originX ?? 0
  const originY = transform.originY ?? 0
  const hasOrigin = originX !== 0 || originY !== 0

  if (translateX !== 0 || translateY !== 0) {
    parts.push(`translate(${formatNumber(translateX)} ${formatNumber(translateY)})`)
  }
  if (hasOrigin) {
    parts.push(`translate(${formatNumber(originX)} ${formatNumber(originY)})`)
  }
  if (transform.rotate !== undefined && transform.rotate !== 0) {
    parts.push(`rotate(${formatNumber(transform.rotate)})`)
  }
  if (transform.skewX !== undefined && transform.skewX !== 0) {
    parts.push(`skewX(${formatNumber(transform.skewX)})`)
  }
  if (transform.skewY !== undefined && transform.skewY !== 0) {
    parts.push(`skewY(${formatNumber(transform.skewY)})`)
  }
  const scaleX = transform.scaleX ?? 1
  const scaleY = transform.scaleY ?? scaleX
  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${formatNumber(scaleX)} ${formatNumber(scaleY)})`)
  }
  if (hasOrigin) {
    parts.push(`translate(${formatNumber(-originX)} ${formatNumber(-originY)})`)
  }

  return parts.join(' ')
}

const commonAttributes = (object: CommonObject, defaults: { fill?: string; stroke?: string } = {}): string => {
  const attributes: string[] = [`id="${escapeAttribute(object.id)}"`]
  const fill = object.fill ?? defaults.fill
  const stroke = object.stroke ?? defaults.stroke

  if (fill !== undefined) {
    attributes.push(`fill="${escapeAttribute(fill)}"`)
  }
  if (stroke !== undefined) {
    attributes.push(`stroke="${escapeAttribute(stroke)}"`)
  }
  if (object.strokeWidth !== undefined) {
    attributes.push(`stroke-width="${formatNumber(object.strokeWidth)}"`)
  }
  if (object.opacity !== undefined) {
    attributes.push(`opacity="${formatNumber(object.opacity)}"`)
  }
  if (object.transform) {
    const value = transformValue(object.transform)
    if (value) {
      attributes.push(`transform="${value}"`)
    }
  }

  return attributes.join(' ')
}

const pointsValue = (points: { x: number; y: number }[]): string => points
  .map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`)
  .join(' ')

const renderObject = (object: SceneObject): string => {
  if (object.visible === false) {
    return ''
  }

  switch (object.type) {
    case 'rect': {
      const cornerAttributes = [
        object.rx === undefined ? '' : ` rx="${formatNumber(object.rx)}"`,
        object.ry === undefined ? '' : ` ry="${formatNumber(object.ry)}"`,
      ].join('')
      return `<rect ${commonAttributes(object, { fill: '#171717' })} x="${formatNumber(object.x)}" y="${formatNumber(object.y)}" width="${formatNumber(object.width)}" height="${formatNumber(object.height)}"${cornerAttributes}/>`
    }
    case 'circle':
      return `<circle ${commonAttributes(object, { fill: '#171717' })} cx="${formatNumber(object.cx)}" cy="${formatNumber(object.cy)}" r="${formatNumber(object.radius)}"/>`
    case 'ellipse':
      return `<ellipse ${commonAttributes(object, { fill: '#171717' })} cx="${formatNumber(object.cx)}" cy="${formatNumber(object.cy)}" rx="${formatNumber(object.rx)}" ry="${formatNumber(object.ry)}"/>`
    case 'line':
      return `<line ${commonAttributes(object, { fill: 'none', stroke: '#171717' })} x1="${formatNumber(object.x1)}" y1="${formatNumber(object.y1)}" x2="${formatNumber(object.x2)}" y2="${formatNumber(object.y2)}"/>`
    case 'polygon':
      return `<polygon ${commonAttributes(object, { fill: '#171717' })} points="${pointsValue(object.points)}"/>`
    case 'polyline':
      return `<polyline ${commonAttributes(object, { fill: 'none', stroke: '#171717' })} points="${pointsValue(object.points)}"/>`
    case 'path':
      return `<path ${commonAttributes(object, { fill: '#171717' })} d="${escapeAttribute(object.d)}" fill-rule="${object.fillRule ?? 'nonzero'}"/>`
    case 'text': {
      const textAttributes = [
        `x="${formatNumber(object.x)}"`,
        `y="${formatNumber(object.y)}"`,
        `font-size="${formatNumber(object.fontSize ?? 16)}"`,
        `font-family="${escapeAttribute(object.fontFamily ?? 'Inter, ui-sans-serif, system-ui, sans-serif')}"`,
        `font-weight="${object.fontWeight ?? 400}"`,
        `text-anchor="${object.textAnchor ?? 'start'}"`,
        object.letterSpacing === undefined ? '' : `letter-spacing="${formatNumber(object.letterSpacing)}"`,
      ].filter(Boolean).join(' ')
      return `<text ${commonAttributes(object, { fill: '#171717' })} ${textAttributes}>${escapeText(object.content)}</text>`
    }
    case 'group': {
      const children = object.children.map(renderObject).join('')
      return `<g ${commonAttributes(object)}>${children}</g>`
    }
  }
}

export const renderSceneToSvg = (scene: VectorScene, options: RenderOptions = {}): string => {
  const width = options.width ?? scene.document.width
  const height = options.height ?? scene.document.height
  const background = options.background === undefined ? scene.document.background : options.background
  const backgroundElement = background && background !== 'none'
    ? `<rect width="100%" height="100%" fill="${escapeAttribute(background)}"/>`
    : ''
  const content = scene.objects.map(renderObject).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(width)}" height="${formatNumber(height)}" viewBox="0 0 ${formatNumber(scene.document.width)} ${formatNumber(scene.document.height)}" role="img" aria-label="Vector Engine output" shape-rendering="geometricPrecision">${backgroundElement}${content}</svg>`
}
