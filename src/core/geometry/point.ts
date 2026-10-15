export type Point = { readonly x: number; readonly y: number }

export const point = (x: number, y: number): Point => ({ x, y })

export const addPoints = (lhs: Point, rhs: Point): Point => ({ x: lhs.x + rhs.x, y: lhs.y + rhs.y })

export const subtractPoints = (lhs: Point, rhs: Point): Point => ({
  x: lhs.x - rhs.x,
  y: lhs.y - rhs.y,
})

export const scalePoint = (value: Point, factor: number): Point => ({
  x: value.x * factor,
  y: value.y * factor,
})

export const distance = (lhs: Point, rhs: Point): number => Math.hypot(rhs.x - lhs.x, rhs.y - lhs.y)
