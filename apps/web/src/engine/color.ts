const shortHex = /^#([0-9a-f]{3,4})$/i
const longHex = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i

export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

export const parseColor = (value: string): RgbaColor | null => {
  const short = value.match(shortHex)?.[1]
  if (short) {
    const expand = (index: number) => short.charAt(index).repeat(2)
    return {
      r: Number.parseInt(expand(0), 16),
      g: Number.parseInt(expand(1), 16),
      b: Number.parseInt(expand(2), 16),
      a: short.length === 4 ? Number.parseInt(expand(3), 16) : 255,
    }
  }

  const long = value.match(longHex)?.[1]
  if (!long) {
    return null
  }

  return {
    r: Number.parseInt(long.slice(0, 2), 16),
    g: Number.parseInt(long.slice(2, 4), 16),
    b: Number.parseInt(long.slice(4, 6), 16),
    a: long.length === 8 ? Number.parseInt(long.slice(6, 8), 16) : 255,
  }
}

export const normalizeColor = (value: string): string => {
  const color = parseColor(value)
  if (!color) {
    return value
  }
  const encode = (channel: number) => channel.toString(16).padStart(2, '0').toUpperCase()
  const alpha = color.a === 255 ? '' : encode(color.a)
  return `#${encode(color.r)}${encode(color.g)}${encode(color.b)}${alpha}`
}
