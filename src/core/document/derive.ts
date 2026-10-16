import { isIdentity, multiply, scaling, translation, type Matrix2D } from '@/core/geometry'
import { createId } from './identifiers'
import type { Color, Layer, PaintStyle, VectorDocument, VectorNode } from './types'

const filterNode = (node: VectorNode, ids: ReadonlySet<string>): VectorNode | undefined => {
  if (ids.has(node.id)) {
    return node
  }
  if (node.type !== 'group') {
    return undefined
  }
  const children = node.children
    .map((child) => filterNode(child, ids))
    .filter((child): child is VectorNode => child !== undefined)
  return children.length > 0 ? { ...node, children } : undefined
}

export const filterDocumentNodes = (
  document: VectorDocument,
  ids: ReadonlySet<string>,
): VectorDocument => ({
  ...document,
  layers: document.layers
    .map((layer): Layer => ({
      ...layer,
      children: layer.children
        .map((child) => filterNode(child, ids))
        .filter((child): child is VectorNode => child !== undefined),
    }))
    .filter((layer) => layer.children.length > 0),
})

const wrapLayers = (document: VectorDocument, matrix: Matrix2D): readonly Layer[] =>
  isIdentity(matrix)
    ? document.layers
    : document.layers.map((layer) => ({
        ...layer,
        children:
          layer.children.length === 0
            ? layer.children
            : [
                {
                  id: createId('frame'),
                  type: 'group',
                  opacity: 1,
                  transform: matrix,
                  children: layer.children,
                },
              ],
      }))

export type DocumentRegion = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const cropDocument = (document: VectorDocument, region: DocumentRegion): VectorDocument => ({
  ...document,
  width: region.width,
  height: region.height,
  layers: wrapLayers(document, translation(-region.x, -region.y)),
})

export type DocumentFrame = {
  readonly width: number
  readonly height: number
}

export const frameDocument = (
  document: VectorDocument,
  frame: DocumentFrame,
  inset = 0,
): VectorDocument => {
  const limit = Math.min(frame.width, frame.height) / 2
  const safeInset = Math.min(Math.max(0, inset), limit * 0.9)
  const factor = Math.min(
    (frame.width - safeInset * 2) / document.width,
    (frame.height - safeInset * 2) / document.height,
  )
  const offsetX = (frame.width - document.width * factor) / 2
  const offsetY = (frame.height - document.height * factor) / 2
  return {
    ...document,
    width: frame.width,
    height: frame.height,
    layers: wrapLayers(document, multiply(translation(offsetX, offsetY), scaling(factor))),
  }
}

const recolorStyle = (style: PaintStyle, color: Color): PaintStyle => ({
  ...(style.fill ? { fill: { color } } : {}),
  ...(style.stroke ? { stroke: { ...style.stroke, color } } : {}),
})

const recolorNode = (node: VectorNode, color: Color): VectorNode => {
  switch (node.type) {
    case 'group':
      return { ...node, children: node.children.map((child) => recolorNode(child, color)) }
    case 'image':
      return node
    default:
      return { ...node, style: recolorStyle(node.style, color) }
  }
}

export const recolorDocument = (document: VectorDocument, color: Color): VectorDocument => ({
  ...document,
  layers: document.layers.map((layer) => ({
    ...layer,
    children: layer.children.map((child) => recolorNode(child, color)),
  })),
})

export const withDocumentBackground = (
  document: VectorDocument,
  background: Color | null,
): VectorDocument => ({ ...document, background })
