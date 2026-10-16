import { applyToPoint, identityMatrix, scaleFactors, type Matrix2D } from './matrix'
import type { PathCommand } from './path'
import type { Point } from './point'

export type Bounds = {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

const EPSILON = 1e-12

class BoundsBuilder {
  #minX = Number.POSITIVE_INFINITY
  #minY = Number.POSITIVE_INFINITY
  #maxX = Number.NEGATIVE_INFINITY
  #maxY = Number.NEGATIVE_INFINITY

  include(point: Point): void {
    this.#minX = Math.min(this.#minX, point.x)
    this.#minY = Math.min(this.#minY, point.y)
    this.#maxX = Math.max(this.#maxX, point.x)
    this.#maxY = Math.max(this.#maxY, point.y)
  }

  includeBounds(bounds: Bounds): void {
    this.include({ x: bounds.minX, y: bounds.minY })
    this.include({ x: bounds.maxX, y: bounds.maxY })
  }

  result(): Bounds | undefined {
    return this.#minX <= this.#maxX
      ? { minX: this.#minX, minY: this.#minY, maxX: this.#maxX, maxY: this.#maxY }
      : undefined
  }
}

const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

const cubicExtrema = (p0: number, p1: number, p2: number, p3: number): number[] => {
  const a = -p0 + 3 * p1 - 3 * p2 + p3
  const b = 2 * (p0 - 2 * p1 + p2)
  const c = p1 - p0
  const roots: number[] = []
  if (Math.abs(a) < EPSILON) {
    if (Math.abs(b) > EPSILON) {
      roots.push(-c / b)
    }
  } else {
    const discriminant = b * b - 4 * a * c
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant)
      roots.push((-b + root) / (2 * a), (-b - root) / (2 * a))
    }
  }
  return roots.filter((t) => t > 0 && t < 1)
}

const includeCubic = (builder: BoundsBuilder, p0: Point, p1: Point, p2: Point, p3: Point): void => {
  builder.include(p3)
  for (const t of cubicExtrema(p0.x, p1.x, p2.x, p3.x)) {
    builder.include({
      x: cubicAt(p0.x, p1.x, p2.x, p3.x, t),
      y: cubicAt(p0.y, p1.y, p2.y, p3.y, t),
    })
  }
  for (const t of cubicExtrema(p0.y, p1.y, p2.y, p3.y)) {
    builder.include({
      x: cubicAt(p0.x, p1.x, p2.x, p3.x, t),
      y: cubicAt(p0.y, p1.y, p2.y, p3.y, t),
    })
  }
}

export const pathBounds = (
  commands: readonly PathCommand[],
  matrix: Matrix2D = identityMatrix,
): Bounds | undefined => {
  const builder = new BoundsBuilder()
  const map = (x: number, y: number): Point => applyToPoint(matrix, { x, y })
  let current: Point = { x: 0, y: 0 }
  let start = current
  for (const command of commands) {
    switch (command.type) {
      case 'M':
        current = map(command.x, command.y)
        start = current
        builder.include(current)
        break
      case 'L':
        current = map(command.x, command.y)
        builder.include(current)
        break
      case 'Q': {
        const control = map(command.x1, command.y1)
        const end = map(command.x, command.y)
        const first = {
          x: current.x + (2 / 3) * (control.x - current.x),
          y: current.y + (2 / 3) * (control.y - current.y),
        }
        const second = {
          x: end.x + (2 / 3) * (control.x - end.x),
          y: end.y + (2 / 3) * (control.y - end.y),
        }
        includeCubic(builder, current, first, second, end)
        current = end
        break
      }
      case 'C': {
        const end = map(command.x, command.y)
        includeCubic(
          builder,
          current,
          map(command.x1, command.y1),
          map(command.x2, command.y2),
          end,
        )
        current = end
        break
      }
      case 'Z':
        current = start
        break
    }
  }
  return builder.result()
}

export const unionBounds = (items: readonly (Bounds | undefined)[]): Bounds | undefined => {
  const builder = new BoundsBuilder()
  items.forEach((item) => item && builder.includeBounds(item))
  return builder.result()
}

export const inflateBounds = (bounds: Bounds, amount: number): Bounds => ({
  minX: bounds.minX - amount,
  minY: bounds.minY - amount,
  maxX: bounds.maxX + amount,
  maxY: bounds.maxY + amount,
})

export const boundsWidth = (bounds: Bounds): number => bounds.maxX - bounds.minX

export const boundsHeight = (bounds: Bounds): number => bounds.maxY - bounds.minY

export const strokeInflation = (strokeWidth: number, matrix: Matrix2D): number => {
  const factors = scaleFactors(matrix)
  return (strokeWidth / 2) * Math.max(factors.x, factors.y)
}
