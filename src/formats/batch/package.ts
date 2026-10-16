import { blobToBytes, createZipBlob, normalizeArchivePath, textEntry } from '../archive/zip'
import type { CompatibilityIssue, Transformation, ValidationStatus } from '../compatibility/report'
import { summarizeJobs, type BatchJob, type BatchSummary, type ConflictPolicy } from './types'

export type PackagingOptions = {
  readonly conflictPolicy: ConflictPolicy
  readonly keepStructure: boolean
}

export type PackagedFile = {
  readonly path: string
  readonly jobId: string
  readonly fileName: string
  readonly blob: Blob
  readonly renamedFrom?: string
}

export type DroppedFile = {
  readonly path: string
  readonly jobId: string
  readonly reason: 'overwritten' | 'skipped'
}

export type PackagingResult = {
  readonly files: readonly PackagedFile[]
  readonly dropped: readonly DroppedFile[]
}

export const BATCH_REPORT_VERSION = 1
export const BATCH_REPORT_FILE_NAME = 'batch-report.json'

const directoryOf = (relativePath: string): string => {
  const normalized = normalizeArchivePath(relativePath)
  const index = normalized.lastIndexOf('/')
  return index === -1 ? '' : normalized.slice(0, index)
}

const joinPath = (directory: string, fileName: string): string =>
  directory ? `${directory}/${fileName}` : fileName

const renamed = (path: string, attempt: number): string => {
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  const stemEnd = dot > slash + 1 ? dot : path.length
  return `${path.slice(0, stemEnd)} (${attempt})${path.slice(stemEnd)}`
}

export const packageBatchOutputs = (
  jobs: readonly BatchJob[],
  options: PackagingOptions,
): PackagingResult => {
  const files: PackagedFile[] = []
  const dropped: DroppedFile[] = []
  const taken = new Map<string, number>()
  for (const job of jobs) {
    const directory = options.keepStructure ? directoryOf(job.input.relativePath) : ''
    for (const output of job.outputs) {
      const path = joinPath(directory, output.fileName)
      const key = path.toLowerCase()
      const existing = taken.get(key)
      if (existing === undefined) {
        taken.set(key, files.length)
        files.push({ path, jobId: job.id, fileName: output.fileName, blob: output.blob })
        continue
      }
      switch (options.conflictPolicy) {
        case 'skip':
          dropped.push({ path, jobId: job.id, reason: 'skipped' })
          break
        case 'overwrite': {
          const previous = files[existing]
          if (previous) {
            dropped.push({ path, jobId: previous.jobId, reason: 'overwritten' })
          }
          files[existing] = { path, jobId: job.id, fileName: output.fileName, blob: output.blob }
          break
        }
        case 'rename': {
          let attempt = 2
          while (taken.has(renamed(path, attempt).toLowerCase())) {
            attempt += 1
          }
          const target = renamed(path, attempt)
          taken.set(target.toLowerCase(), files.length)
          files.push({
            path: target,
            jobId: job.id,
            fileName: output.fileName,
            blob: output.blob,
            renamedFrom: path,
          })
          break
        }
      }
    }
  }
  return { files, dropped }
}

export type BatchOutputReport = {
  readonly path: string
  readonly targetFormat: string
  readonly processedObjects: number
  readonly skippedObjects: number
  readonly warningCount: number
  readonly validation: ValidationStatus
  readonly issues: readonly CompatibilityIssue[]
  readonly transformations: readonly Transformation[]
}

export type BatchJobReport = {
  readonly id: string
  readonly fileName: string
  readonly relativePath: string
  readonly state: BatchJob['state']
  readonly durationMs?: number
  readonly error?: string
  readonly duplicateOf?: string
  readonly warnings: readonly string[]
  readonly outputs: readonly BatchOutputReport[]
}

export type BatchSessionReport = {
  readonly reportVersion: typeof BATCH_REPORT_VERSION
  readonly createdAt: string
  readonly options: PackagingOptions
  readonly summary: BatchSummary
  readonly jobs: readonly BatchJobReport[]
  readonly dropped: readonly DroppedFile[]
}

export const buildBatchReport = (
  jobs: readonly BatchJob[],
  packaging: PackagingResult,
  options: PackagingOptions,
  now: Date = new Date(),
): BatchSessionReport => ({
  reportVersion: BATCH_REPORT_VERSION,
  createdAt: now.toISOString(),
  options,
  summary: summarizeJobs(jobs),
  jobs: jobs.map((job) => ({
    id: job.id,
    fileName: job.input.fileName,
    relativePath: job.input.relativePath,
    state: job.state,
    ...(job.startedAt !== undefined && job.finishedAt !== undefined
      ? { durationMs: job.finishedAt - job.startedAt }
      : {}),
    ...(job.error ? { error: job.error } : {}),
    ...(job.duplicateOf ? { duplicateOf: job.duplicateOf } : {}),
    warnings: job.warnings,
    outputs: job.outputs.map((output) => ({
      path:
        packaging.files.find((file) => file.jobId === job.id && file.fileName === output.fileName)
          ?.path ?? output.fileName,
      targetFormat: output.report.targetFormat,
      processedObjects: output.report.processedObjects,
      skippedObjects: output.report.skippedObjects,
      warningCount: output.report.warningCount,
      validation: output.report.validation,
      issues: output.report.issues,
      transformations: output.report.transformations,
    })),
  })),
  dropped: packaging.dropped,
})

export const serializeBatchReport = (report: BatchSessionReport): string =>
  JSON.stringify(report, null, 2)

export type BatchArchive = {
  readonly blob: Blob
  readonly report: BatchSessionReport
  readonly fileCount: number
}

export const createBatchArchive = async (
  jobs: readonly BatchJob[],
  options: PackagingOptions,
  now: Date = new Date(),
): Promise<BatchArchive> => {
  const packaging = packageBatchOutputs(jobs, options)
  const report = buildBatchReport(jobs, packaging, options, now)
  const entries = await Promise.all(
    packaging.files.map(async (file) => ({ path: file.path, bytes: await blobToBytes(file.blob) })),
  )
  entries.push(textEntry(BATCH_REPORT_FILE_NAME, serializeBatchReport(report)))
  return { blob: createZipBlob(entries), report, fileCount: packaging.files.length }
}
