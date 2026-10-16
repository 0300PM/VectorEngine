import {
  cropDocument,
  filterDocumentNodes,
  pixelsPerUnit,
  recolorDocument,
  withDocumentBackground,
  type VectorDocument,
} from '@/core/document'
import { boundsHeight, boundsWidth, inflateBounds } from '@/core/geometry'
import { buildRenderScene, sceneBounds } from '@/core/scene'
import type { ExportScope, ExportVariant } from './types'

export type ScopedDocument = {
  readonly document: VectorDocument
  readonly empty: boolean
}

export const scopeDocument = (document: VectorDocument, scope: ExportScope): ScopedDocument => {
  if (scope.kind === 'document') {
    return { document, empty: false }
  }
  const filtered = filterDocumentNodes(document, new Set(scope.nodeIds))
  const dpi = document.exportSettings.dpi
  const bounds = sceneBounds(buildRenderScene(filtered, { dpi }).scene)
  if (!bounds) {
    return { document: filtered, empty: true }
  }
  const scale = pixelsPerUnit(document.unit, dpi)
  const margin = Math.max(0, scope.padding) * Math.max(boundsWidth(bounds), boundsHeight(bounds))
  const padded = inflateBounds(bounds, margin)
  return {
    document: cropDocument(filtered, {
      x: padded.minX / scale,
      y: padded.minY / scale,
      width: boundsWidth(padded) / scale,
      height: boundsHeight(padded) / scale,
    }),
    empty: false,
  }
}

export const applyVariantStyle = (
  document: VectorDocument,
  variant: ExportVariant,
): VectorDocument => {
  const background =
    variant.background.mode === 'document'
      ? document
      : withDocumentBackground(
          document,
          variant.background.mode === 'color' ? variant.background.color : null,
        )
  return variant.recolor ? recolorDocument(background, variant.recolor) : background
}
