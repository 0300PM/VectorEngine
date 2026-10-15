import {
  degreesToRadians,
  identityMatrix,
  multiply,
  rotation,
  scaling,
  translation,
  type Matrix2D,
} from '@/core/geometry'
import { parseNumberList } from './numbers'

const transformPattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g

const skewX = (degrees: number): Matrix2D => ({
  a: 1,
  b: 0,
  c: Math.tan(degreesToRadians(degrees)),
  d: 1,
  e: 0,
  f: 0,
})

const skewY = (degrees: number): Matrix2D => ({
  a: 1,
  b: Math.tan(degreesToRadians(degrees)),
  c: 0,
  d: 1,
  e: 0,
  f: 0,
})

const toMatrix = (name: string, args: readonly number[]): Matrix2D | undefined => {
  const [first, second, third, fourth, fifth, sixth] = args
  switch (name) {
    case 'matrix':
      return args.length === 6
        ? { a: first!, b: second!, c: third!, d: fourth!, e: fifth!, f: sixth! }
        : undefined
    case 'translate':
      return first === undefined ? undefined : translation(first, second ?? 0)
    case 'scale':
      return first === undefined ? undefined : scaling(first, second ?? first)
    case 'rotate':
      if (first === undefined) {
        return undefined
      }
      if (second !== undefined && third !== undefined) {
        return multiply(
          multiply(translation(second, third), rotation(degreesToRadians(first))),
          translation(-second, -third),
        )
      }
      return rotation(degreesToRadians(first))
    case 'skewX':
      return first === undefined ? undefined : skewX(first)
    case 'skewY':
      return first === undefined ? undefined : skewY(first)
    default:
      return undefined
  }
}

export type ParsedTransform = { readonly matrix: Matrix2D; readonly malformed: boolean }

export const parseTransform = (text: string | undefined): ParsedTransform => {
  if (!text?.trim()) {
    return { matrix: identityMatrix, malformed: false }
  }
  let matrix = identityMatrix
  let malformed = false
  let consumed = ''
  for (const match of text.matchAll(transformPattern)) {
    consumed += match[0]
    const next = toMatrix(match[1] ?? '', parseNumberList(match[2]))
    if (next) {
      matrix = multiply(matrix, next)
    } else {
      malformed = true
    }
  }
  if (text.replace(/[\s,]/g, '').length !== consumed.replace(/[\s,]/g, '').length) {
    malformed = true
  }
  return { matrix, malformed }
}

export const formatTransform = (matrix: Matrix2D, format: (value: number) => string): string =>
  `matrix(${[matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].map((value) => format(value)).join(' ')})`
