import { namedColors } from './namedColors'
import { channelToByte, rgba, rgbaFromPacked, transparent, type Rgba } from './rgba'

const HEX_PATTERN = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNCTION_PATTERN = /^(rgba?|hsla?)\(\s*(.+?)\s*\)$/i
const ARGUMENT_SEPARATOR = /\s*[,/]\s*|\s+/

const parseHexChannel = (hex: string): number => Number.parseInt(hex, 16) / 255

const expandShortHex = (hex: string): string =>
  hex
    .split('')
    .map((digit) => digit + digit)
    .join('')

const parseHex = (text: string): Rgba | undefined => {
  const match = HEX_PATTERN.exec(text)
  if (!match?.[1]) {
    return undefined
  }
  const digits = match[1].length <= 4 ? expandShortHex(match[1]) : match[1]
  const channels = digits.match(/.{2}/g) ?? []
  const [r, g, b, a] = channels.map(parseHexChannel)
  if (r === undefined || g === undefined || b === undefined) {
    return undefined
  }
  return rgba(r, g, b, a ?? 1)
}

const parseNumber = (token: string, scale: number): number | undefined => {
  const isPercent = token.endsWith('%')
  const value = Number.parseFloat(isPercent ? token.slice(0, -1) : token)
  if (!Number.isFinite(value)) {
    return undefined
  }
  return isPercent ? value / 100 : value / scale
}

const parseAlpha = (token: string | undefined): number | undefined =>
  token === undefined ? 1 : parseNumber(token, 1)

const parseHue = (token: string): number | undefined => {
  const value = Number.parseFloat(token.replace(/deg$/i, ''))
  return Number.isFinite(value) ? (((value % 360) + 360) % 360) / 360 : undefined
}

const hueToChannel = (p: number, q: number, t: number): number => {
  const hue = ((t % 1) + 1) % 1
  if (hue < 1 / 6) return p + (q - p) * 6 * hue
  if (hue < 1 / 2) return q
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6
  return p
}

const hslToRgba = (h: number, s: number, l: number, a: number): Rgba => {
  if (s === 0) {
    return rgba(l, l, l, a)
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return rgba(
    hueToChannel(p, q, h + 1 / 3),
    hueToChannel(p, q, h),
    hueToChannel(p, q, h - 1 / 3),
    a,
  )
}

const parseFunctional = (text: string): Rgba | undefined => {
  const match = FUNCTION_PATTERN.exec(text)
  if (!match?.[1] || !match[2]) {
    return undefined
  }
  const tokens = match[2].split(ARGUMENT_SEPARATOR).filter(Boolean)
  if (tokens.length < 3 || tokens.length > 4) {
    return undefined
  }
  const [first, second, third, fourth] = tokens
  if (first === undefined || second === undefined || third === undefined) {
    return undefined
  }
  const alpha = parseAlpha(fourth)
  if (alpha === undefined) {
    return undefined
  }

  if (match[1].toLowerCase().startsWith('rgb')) {
    const r = parseNumber(first, 255)
    const g = parseNumber(second, 255)
    const b = parseNumber(third, 255)
    return r === undefined || g === undefined || b === undefined ? undefined : rgba(r, g, b, alpha)
  }

  const h = parseHue(first)
  const s = parseNumber(second, 1)
  const l = parseNumber(third, 1)
  return h === undefined || s === undefined || l === undefined
    ? undefined
    : hslToRgba(h, s, l, alpha)
}

export const parseColor = (input: string): Rgba | undefined => {
  const text = input.trim()
  if (text.length === 0) {
    return undefined
  }
  const lowered = text.toLowerCase()
  if (lowered === 'transparent') {
    return transparent
  }
  const named = namedColors[lowered]
  if (named !== undefined) {
    return rgbaFromPacked(named)
  }
  return text.startsWith('#') ? parseHex(text) : parseFunctional(text)
}

export const isColor = (input: unknown): input is string =>
  typeof input === 'string' && parseColor(input) !== undefined

const toHexPair = (channel: number): string => channelToByte(channel).toString(16).padStart(2, '0')

export const formatColor = (color: Rgba): string => {
  const base = `#${toHexPair(color.r)}${toHexPair(color.g)}${toHexPair(color.b)}`
  return color.a >= 1 ? base : `${base}${toHexPair(color.a)}`
}

export const formatCssColor = (color: Rgba): string =>
  `rgba(${channelToByte(color.r)}, ${channelToByte(color.g)}, ${channelToByte(color.b)}, ${Number(color.a.toFixed(4))})`
