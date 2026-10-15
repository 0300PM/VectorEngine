import type { GroupNode, Layer, VectorDocument, VectorNode } from './types'

export type NodeVisit = {
  readonly node: VectorNode
  readonly layer: Layer
  readonly ancestors: readonly GroupNode[]
}

function* iterateChildren(
  nodes: readonly VectorNode[],
  layer: Layer,
  ancestors: readonly GroupNode[],
): Generator<NodeVisit> {
  for (const node of nodes) {
    yield { node, layer, ancestors }
    if (node.type === 'group') {
      yield* iterateChildren(node.children, layer, [...ancestors, node])
    }
  }
}

export function* iterateNodes(document: VectorDocument): Generator<NodeVisit> {
  for (const layer of document.layers) {
    yield* iterateChildren(layer.children, layer, [])
  }
}

export const findNode = (document: VectorDocument, nodeId: string): VectorNode | undefined => {
  for (const visit of iterateNodes(document)) {
    if (visit.node.id === nodeId) {
      return visit.node
    }
  }
  return undefined
}

export const countNodes = (document: VectorDocument): number =>
  Array.from(iterateNodes(document)).length

export const updateLayer = (
  document: VectorDocument,
  layerId: string,
  update: (layer: Layer) => Layer,
): VectorDocument => ({
  ...document,
  layers: document.layers.map((layer) => (layer.id === layerId ? update(layer) : layer)),
})

export const setLayerVisibility = (
  document: VectorDocument,
  layerId: string,
  visible: boolean,
): VectorDocument => updateLayer(document, layerId, (layer) => ({ ...layer, visible }))

export const setLayerLocked = (
  document: VectorDocument,
  layerId: string,
  locked: boolean,
): VectorDocument => updateLayer(document, layerId, (layer) => ({ ...layer, locked }))

export const touchDocument = (
  document: VectorDocument,
  modifiedAt = new Date(),
): VectorDocument => ({
  ...document,
  metadata: { ...document.metadata, modifiedAt: modifiedAt.toISOString() },
})
