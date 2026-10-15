import { applyToPoint, type Matrix2D } from './matrix'
import type { Point } from './point'

export type MoveTo = { readonly type: 'M'; readonly x: number; readonly y: number }
export type LineTo = { readonly type: 'L'; readonly x: number; readonly y: number }
export type QuadraticTo = {
  readonly type: 'Q'
  readonly x1: number
  readonly y1: number
  readonly x: number
  readonly y: number
}
export type CubicTo = {
  readonly type: 'C'
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly x: number
  readonly y: number
}
export type ClosePath = { readonly type: 'Z' }

export type PathCommand = MoveTo | LineTo | QuadraticTo | CubicTo | ClosePath

export const fillRules = ['nonzero', 'evenodd'] as const
export type FillRule = (typeof fillRules)[number]

export type PathGeometry = {
  readonly commands: readonly PathCommand[]
  readonly fillRule: FillRule
}

const CIRCLE_KAPPA = 0.5522847498307936

export const moveTo = (x: number, y: number): MoveTo => ({ type: 'M', x, y })

export const lineTo = (x: number, y: number): LineTo => ({ type: 'L', x, y })

export const quadraticTo = (x1: number, y1: number, x: number, y: number): QuadraticTo => ({
  type: 'Q',
  x1,
  y1,
  x,
  y,
})

export const cubicTo = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
): CubicTo => ({ type: 'C', x1, y1, x2, y2, x, y })

export const closePath = (): ClosePath => ({ type: 'Z' })

export const linePath = (from: Point, to: Point): PathCommand[] => [
  moveTo(from.x, from.y),
  lineTo(to.x, to.y),
]

export const rectanglePath = (
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius = 0,
): PathCommand[] => {
  const radius = Math.min(Math.max(cornerRadius, 0), width / 2, height / 2)
  if (radius <= 0) {
    return [
      moveTo(x, y),
      lineTo(x + width, y),
      lineTo(x + width, y + height),
      lineTo(x, y + height),
      closePath(),
    ]
  }

  const handle = radius * CIRCLE_KAPPA
  const right = x + width
  const bottom = y + height

  return [
    moveTo(x + radius, y),
    lineTo(right - radius, y),
    cubicTo(right - radius + handle, y, right, y + radius - handle, right, y + radius),
    lineTo(right, bottom - radius),
    cubicTo(
      right,
      bottom - radius + handle,
      right - radius + handle,
      bottom,
      right - radius,
      bottom,
    ),
    lineTo(x + radius, bottom),
    cubicTo(x + radius - handle, bottom, x, bottom - radius + handle, x, bottom - radius),
    lineTo(x, y + radius),
    cubicTo(x, y + radius - handle, x + radius - handle, y, x + radius, y),
    closePath(),
  ]
}

export const ellipsePath = (cx: number, cy: number, rx: number, ry: number): PathCommand[] => {
  const hx = rx * CIRCLE_KAPPA
  const hy = ry * CIRCLE_KAPPA
  return [
    moveTo(cx + rx, cy),
    cubicTo(cx + rx, cy + hy, cx + hx, cy + ry, cx, cy + ry),
    cubicTo(cx - hx, cy + ry, cx - rx, cy + hy, cx - rx, cy),
    cubicTo(cx - rx, cy - hy, cx - hx, cy - ry, cx, cy - ry),
    cubicTo(cx + hx, cy - ry, cx + rx, cy - hy, cx + rx, cy),
    closePath(),
  ]
}

export const transformPath = (commands: readonly PathCommand[], matrix: Matrix2D): PathCommand[] =>
  commands.map((command): PathCommand => {
    switch (command.type) {
      case 'M': {
        const end = applyToPoint(matrix, command)
        return moveTo(end.x, end.y)
      }
      case 'L': {
        const end = applyToPoint(matrix, command)
        return lineTo(end.x, end.y)
      }
      case 'Q': {
        const control = applyToPoint(matrix, { x: command.x1, y: command.y1 })
        const end = applyToPoint(matrix, command)
        return quadraticTo(control.x, control.y, end.x, end.y)
      }
      case 'C': {
        const first = applyToPoint(matrix, { x: command.x1, y: command.y1 })
        const second = applyToPoint(matrix, { x: command.x2, y: command.y2 })
        const end = applyToPoint(matrix, command)
        return cubicTo(first.x, first.y, second.x, second.y, end.x, end.y)
      }
      case 'Z':
        return command
    }
  })

export const pathCoordinateCount = (command: PathCommand): number => {
  switch (command.type) {
    case 'M':
    case 'L':
      return 2
    case 'Q':
      return 4
    case 'C':
      return 6
    case 'Z':
      return 0
  }
}
