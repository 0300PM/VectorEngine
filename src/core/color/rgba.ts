export type Rgba = {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value))

export const rgba = (r: number, g: number, b: number, a = 1): Rgba => ({
  r: clampUnit(r),
  g: clampUnit(g),
  b: clampUnit(b),
  a: clampUnit(a),
})

export const transparent: Rgba = Object.freeze({ r: 0, g: 0, b: 0, a: 0 })

export const opaqueBlack: Rgba = Object.freeze({ r: 0, g: 0, b: 0, a: 1 })

export const opaqueWhite: Rgba = Object.freeze({ r: 1, g: 1, b: 1, a: 1 })

export const withAlphaMultiplier = (color: Rgba, multiplier: number): Rgba => ({
  ...color,
  a: clampUnit(color.a * multiplier),
})

export const channelToByte = (channel: number): number => Math.round(clampUnit(channel) * 255)

export const isOpaque = (color: Rgba): boolean => color.a >= 1

export const rgbaFromPacked = (packed: number, alpha = 1): Rgba =>
  rgba(((packed >> 16) & 0xff) / 255, ((packed >> 8) & 0xff) / 255, (packed & 0xff) / 255, alpha)
