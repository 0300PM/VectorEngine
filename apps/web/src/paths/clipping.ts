import * as polygonClipping from 'polygon-clipping'
import type { MultiPolygon } from 'polygon-clipping'

export type { MultiPolygon, Pair, Ring } from 'polygon-clipping'

interface ClippingApi {
  union: (...geoms: unknown[]) => MultiPolygon
  intersection: (...geoms: unknown[]) => MultiPolygon
  xor: (...geoms: unknown[]) => MultiPolygon
  difference: (...geoms: unknown[]) => MultiPolygon
}

const namespace = polygonClipping as unknown as ClippingApi & { default?: ClippingApi }
const clipping = namespace.default ?? namespace

export const clipUnion = clipping.union

export const clipIntersection = clipping.intersection

export const clipXor = clipping.xor

export const clipDifference = clipping.difference
