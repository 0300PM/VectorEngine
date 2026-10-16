import type { DocumentIssue } from '@/core/document'
import { runExportSet, type ExportSet, type ExportSetContext } from '../export-set'
import { fileStem, slugify, type ReadInput } from '../types'
import type { BatchJobResult, BatchProcessor } from './types'

export type BatchProcessorOptions = {
  readonly set: ExportSet
  readonly context: Omit<ExportSetContext, 'signal' | 'sourceFormat'>
}

export class BatchImportError extends Error {
  readonly issues: readonly DocumentIssue[]

  constructor(fileName: string, issues: readonly DocumentIssue[]) {
    super(
      `${fileName}: ${issues
        .slice(0, 3)
        .map((issue) => issue.message)
        .join('; ')}`,
    )
    this.name = 'BatchImportError'
    this.issues = issues
  }
}

export const createBatchProcessor =
  (options: BatchProcessorOptions): BatchProcessor =>
  async (job, signal): Promise<BatchJobResult> => {
    const input: ReadInput = { fileName: job.input.fileName, bytes: job.input.bytes }
    const reader = options.context.registry.findReader(input)
    if (!reader) {
      throw new Error(`${job.input.fileName}: unsupported file type`)
    }
    const read = await reader.read(input)
    if (!read.ok) {
      throw new BatchImportError(job.input.fileName, read.error.issues)
    }
    const result = await runExportSet(
      read.value.document,
      options.set,
      slugify(fileStem(job.input.fileName)),
      { ...options.context, sourceFormat: reader.id, signal },
    )
    if (result.files.length === 0 && result.failures.length > 0) {
      throw new Error(result.failures.map((failure) => failure.message).join('; '))
    }
    return {
      outputs: result.files.map((file) => ({
        fileName: file.fileName,
        blob: file.blob,
        report: file.report,
      })),
      warnings: [
        ...read.value.warnings.map((warning) =>
          warning.detail ? `${warning.code}: ${warning.detail}` : warning.code,
        ),
        ...result.failures.map((failure) => `${failure.fileName}: ${failure.message}`),
      ],
    }
  }
