import type { VectorDocument } from '@/core/document'
import { buildRenderScene, fitRenderScene } from '@/core/scene'
import type { ExportSetContext, ExportVariant } from '../export-set'
import { applyVariantStyle } from '../export-set/scope'
import type { AssetProblem } from './types'

export const READABILITY_SIZE = 16
export const MIN_COVERAGE = 0.05
export const MAX_COVERAGE = 0.98
export const MIN_STROKE_PX = 1

const transformScale = (matrix: { a: number; b: number; c: number; d: number }): number =>
  Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c))

export const checkIconReadability = async (
  document: VectorDocument,
  variant: ExportVariant,
  context: Pick<ExportSetContext, 'render'>,
  size = READABILITY_SIZE,
): Promise<AssetProblem[]> => {
  const styled = applyVariantStyle(document, variant)
  const build = buildRenderScene(styled, { dpi: styled.exportSettings.dpi })
  const inset = Math.max(0, variant.padding) * size
  const scene = fitRenderScene(build.scene, { width: size, height: size }, inset)
  const problems: AssetProblem[] = []

  const thin = scene.items.filter(
    (item) => item.stroke && item.stroke.width * transformScale(item.transform) < MIN_STROKE_PX,
  )
  if (thin.length > 0) {
    problems.push({
      code: 'strokes_too_thin',
      detail: `${thin.length} × <${MIN_STROKE_PX}px @ ${size}px`,
    })
  }

  const result = await context.render(scene)
  let covered = 0
  for (let index = 3; index < result.pixels.length; index += 4) {
    if ((result.pixels[index] ?? 0) > 0) {
      covered += 1
    }
  }
  const coverage = covered / (result.width * result.height)
  if (styled.background === null && coverage < MIN_COVERAGE) {
    problems.push({ code: 'icon_sparse', detail: `${Math.round(coverage * 100)}% @ ${size}px` })
  }
  if (styled.background === null && coverage > MAX_COVERAGE) {
    problems.push({ code: 'icon_overflow', detail: `${Math.round(coverage * 100)}% @ ${size}px` })
  }
  return problems
}
