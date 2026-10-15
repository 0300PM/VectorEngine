import {
  closePath,
  cubicTo,
  lineTo,
  moveTo,
  quadraticTo,
  type PathCommand,
  type Point,
} from '@/core/geometry'
import { formatNumber } from './numbers'

const numberPattern = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y
const commandPattern = /[MmLlHhVvCcSsQqTtAaZz]/y

class Scanner {
  #position = 0
  readonly #text: string

  constructor(text: string) {
    this.#text = text
  }

  get done(): boolean {
    this.skipSeparators()
    return this.#position >= this.#text.length
  }

  skipSeparators(): void {
    while (this.#position < this.#text.length && /[\s,]/.test(this.#text[this.#position] ?? '')) {
      this.#position += 1
    }
  }

  command(): string | undefined {
    this.skipSeparators()
    commandPattern.lastIndex = this.#position
    const match = commandPattern.exec(this.#text)
    if (!match) {
      return undefined
    }
    this.#position = commandPattern.lastIndex
    return match[0]
  }

  hasNumber(): boolean {
    this.skipSeparators()
    numberPattern.lastIndex = this.#position
    return numberPattern.test(this.#text)
  }

  number(): number {
    this.skipSeparators()
    numberPattern.lastIndex = this.#position
    const match = numberPattern.exec(this.#text)
    if (!match) {
      throw new SyntaxError(`Expected a number at offset ${this.#position}`)
    }
    this.#position = numberPattern.lastIndex
    return Number(match[0])
  }

  flag(): boolean {
    this.skipSeparators()
    const character = this.#text[this.#position]
    if (character !== '0' && character !== '1') {
      throw new SyntaxError(`Expected an arc flag at offset ${this.#position}`)
    }
    this.#position += 1
    return character === '1'
  }
}

type ArcParameters = {
  readonly rx: number
  readonly ry: number
  readonly rotationDegrees: number
  readonly largeArc: boolean
  readonly sweep: boolean
}

const TAU = Math.PI * 2

const vectorAngle = (ux: number, uy: number, vx: number, vy: number): number => {
  const dot = ux * vx + uy * vy
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  const angle = Math.acos(Math.min(1, Math.max(-1, dot / length)))
  return ux * vy - uy * vx < 0 ? -angle : angle
}

export const arcToCubics = (from: Point, to: Point, arc: ArcParameters): PathCommand[] => {
  if (from.x === to.x && from.y === to.y) {
    return []
  }
  let rx = Math.abs(arc.rx)
  let ry = Math.abs(arc.ry)
  if (rx === 0 || ry === 0) {
    return [lineTo(to.x, to.y)]
  }
  const phi = (arc.rotationDegrees * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx = (from.x - to.x) / 2
  const dy = (from.y - to.y) / 2
  const x1 = cosPhi * dx + sinPhi * dy
  const y1 = -sinPhi * dx + cosPhi * dy
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
  }
  const sign = arc.largeArc === arc.sweep ? -1 : 1
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator))
  const cx1 = (coefficient * rx * y1) / ry
  const cy1 = (coefficient * -ry * x1) / rx
  const cx = cosPhi * cx1 - sinPhi * cy1 + (from.x + to.x) / 2
  const cy = sinPhi * cx1 + cosPhi * cy1 + (from.y + to.y) / 2

  const startAngle = vectorAngle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let sweepAngle = vectorAngle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!arc.sweep && sweepAngle > 0) {
    sweepAngle -= TAU
  } else if (arc.sweep && sweepAngle < 0) {
    sweepAngle += TAU
  }

  const segments = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2) - 1e-9))
  const delta = sweepAngle / segments
  const handle = (4 / 3) * Math.tan(delta / 4)

  const pointAt = (angle: number): Point => ({
    x: cx + rx * Math.cos(angle) * cosPhi - ry * Math.sin(angle) * sinPhi,
    y: cy + rx * Math.cos(angle) * sinPhi + ry * Math.sin(angle) * cosPhi,
  })
  const derivativeAt = (angle: number): Point => ({
    x: -rx * Math.sin(angle) * cosPhi - ry * Math.cos(angle) * sinPhi,
    y: -rx * Math.sin(angle) * sinPhi + ry * Math.cos(angle) * cosPhi,
  })

  const commands: PathCommand[] = []
  for (let index = 0; index < segments; index += 1) {
    const angleA = startAngle + index * delta
    const angleB = angleA + delta
    const start = pointAt(angleA)
    const end = index === segments - 1 ? to : pointAt(angleB)
    const tangentA = derivativeAt(angleA)
    const tangentB = derivativeAt(angleB)
    commands.push(
      cubicTo(
        start.x + handle * tangentA.x,
        start.y + handle * tangentA.y,
        end.x - handle * tangentB.x,
        end.y - handle * tangentB.y,
        end.x,
        end.y,
      ),
    )
  }
  return commands
}

class PathDataParser {
  readonly commands: PathCommand[] = []
  readonly #scanner: Scanner
  #current: Point = { x: 0, y: 0 }
  #start: Point = { x: 0, y: 0 }
  #lastControl: Point | undefined
  #lastCommand = ''

  constructor(text: string) {
    this.#scanner = new Scanner(text)
  }

  parse(): PathCommand[] {
    let command = this.#scanner.command()
    while (command !== undefined) {
      this.#execute(command)
      command = this.#nextCommand(command)
    }
    return this.commands
  }

  #nextCommand(previous: string): string | undefined {
    const explicit = this.#scanner.command()
    if (explicit !== undefined) {
      return explicit
    }
    if (this.#scanner.done) {
      return undefined
    }
    if (!this.#scanner.hasNumber()) {
      throw new SyntaxError('Unexpected character in path data')
    }
    if (previous === 'M') {
      return 'L'
    }
    if (previous === 'm') {
      return 'l'
    }
    if (previous === 'Z' || previous === 'z') {
      throw new SyntaxError('Coordinates after closepath require a command')
    }
    return previous
  }

  #point(relative: boolean): Point {
    const x = this.#scanner.number()
    const y = this.#scanner.number()
    return relative ? { x: this.#current.x + x, y: this.#current.y + y } : { x, y }
  }

  #reflectedControl(kinds: readonly string[]): Point {
    if (this.#lastControl && kinds.includes(this.#lastCommand.toUpperCase())) {
      return {
        x: 2 * this.#current.x - this.#lastControl.x,
        y: 2 * this.#current.y - this.#lastControl.y,
      }
    }
    return this.#current
  }

  #execute(command: string): void {
    const relative = command === command.toLowerCase()
    switch (command.toUpperCase()) {
      case 'M': {
        const point = this.#point(relative)
        this.commands.push(moveTo(point.x, point.y))
        this.#current = point
        this.#start = point
        this.#lastControl = undefined
        break
      }
      case 'L': {
        const point = this.#point(relative)
        this.#line(point)
        break
      }
      case 'H': {
        const x = this.#scanner.number()
        this.#line({ x: relative ? this.#current.x + x : x, y: this.#current.y })
        break
      }
      case 'V': {
        const y = this.#scanner.number()
        this.#line({ x: this.#current.x, y: relative ? this.#current.y + y : y })
        break
      }
      case 'C': {
        const first = this.#point(relative)
        const second = this.#point(relative)
        const end = this.#point(relative)
        this.#cubic(first, second, end)
        break
      }
      case 'S': {
        const first = this.#reflectedControl(['C', 'S'])
        const second = this.#point(relative)
        const end = this.#point(relative)
        this.#cubic(first, second, end)
        break
      }
      case 'Q': {
        const control = this.#point(relative)
        const end = this.#point(relative)
        this.#quadratic(control, end)
        break
      }
      case 'T': {
        const control = this.#reflectedControl(['Q', 'T'])
        const end = this.#point(relative)
        this.#quadratic(control, end)
        break
      }
      case 'A': {
        const rx = this.#scanner.number()
        const ry = this.#scanner.number()
        const rotationDegrees = this.#scanner.number()
        const largeArc = this.#scanner.flag()
        const sweep = this.#scanner.flag()
        const end = this.#point(relative)
        this.commands.push(
          ...arcToCubics(this.#current, end, { rx, ry, rotationDegrees, largeArc, sweep }),
        )
        this.#current = end
        this.#lastControl = undefined
        break
      }
      case 'Z':
        this.commands.push(closePath())
        this.#current = this.#start
        this.#lastControl = undefined
        break
    }
    this.#lastCommand = command
  }

  #line(point: Point): void {
    this.commands.push(lineTo(point.x, point.y))
    this.#current = point
    this.#lastControl = undefined
  }

  #cubic(first: Point, second: Point, end: Point): void {
    this.commands.push(cubicTo(first.x, first.y, second.x, second.y, end.x, end.y))
    this.#current = end
    this.#lastControl = second
  }

  #quadratic(control: Point, end: Point): void {
    this.commands.push(quadraticTo(control.x, control.y, end.x, end.y))
    this.#current = end
    this.#lastControl = control
  }
}

export const parsePathData = (text: string): PathCommand[] => new PathDataParser(text).parse()

export const formatPathData = (commands: readonly PathCommand[]): string =>
  commands
    .map((command) => {
      switch (command.type) {
        case 'M':
        case 'L':
          return `${command.type}${formatNumber(command.x)} ${formatNumber(command.y)}`
        case 'Q':
          return `Q${[command.x1, command.y1, command.x, command.y].map((value) => formatNumber(value)).join(' ')}`
        case 'C':
          return `C${[command.x1, command.y1, command.x2, command.y2, command.x, command.y]
            .map((value) => formatNumber(value))
            .join(' ')}`
        case 'Z':
          return 'Z'
      }
    })
    .join(' ')
