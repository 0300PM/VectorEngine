import type { ExportedFile, ExportFailure } from '../export-set'

export const assetProblemCodes = [
  'missing_file',
  'icon_sparse',
  'icon_overflow',
  'strokes_too_thin',
] as const
export type AssetProblemCode = (typeof assetProblemCodes)[number]

export type AssetProblem = {
  readonly code: AssetProblemCode
  readonly detail?: string
}

export type ExtraFile = {
  readonly fileName: string
  readonly blob: Blob
}

export type AssetStudioResult = {
  readonly files: readonly ExportedFile[]
  readonly extras: readonly ExtraFile[]
  readonly failures: readonly ExportFailure[]
  readonly problems: readonly AssetProblem[]
}

export const requireFiles = (
  files: readonly { readonly fileName: string }[],
  required: readonly string[],
): AssetProblem[] =>
  required
    .filter((fileName) => !files.some((file) => file.fileName === fileName))
    .map((fileName) => ({ code: 'missing_file', detail: fileName }))
