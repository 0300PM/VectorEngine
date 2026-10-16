import type { ConversionReport } from '../compatibility/report'

export const batchJobStates = [
  'pending',
  'running',
  'done',
  'done_with_warnings',
  'failed',
  'cancelled',
  'skipped',
] as const
export type BatchJobState = (typeof batchJobStates)[number]

export const finishedStates: ReadonlySet<BatchJobState> = new Set([
  'done',
  'done_with_warnings',
  'failed',
  'cancelled',
  'skipped',
])

export const retryableStates: ReadonlySet<BatchJobState> = new Set([
  'failed',
  'cancelled',
  'skipped',
])

export type BatchInput = {
  readonly fileName: string
  readonly relativePath: string
  readonly bytes: Uint8Array
}

export type BatchOutput = {
  readonly fileName: string
  readonly blob: Blob
  readonly report: ConversionReport
}

export type BatchJob = {
  readonly id: string
  readonly input: BatchInput
  readonly hash: string
  readonly state: BatchJobState
  readonly outputs: readonly BatchOutput[]
  readonly warnings: readonly string[]
  readonly error?: string
  readonly duplicateOf?: string
  readonly startedAt?: number
  readonly finishedAt?: number
}

export type BatchJobResult = {
  readonly outputs: readonly BatchOutput[]
  readonly warnings: readonly string[]
}

export type BatchProcessor = (job: BatchJob, signal: AbortSignal) => Promise<BatchJobResult>

export const conflictPolicies = ['rename', 'overwrite', 'skip'] as const
export type ConflictPolicy = (typeof conflictPolicies)[number]

export const MIN_CONCURRENCY = 1
export const MAX_CONCURRENCY = 8
export const DEFAULT_CONCURRENCY = 2

export type BatchSummary = Readonly<Record<BatchJobState, number>>

export const summarizeJobs = (jobs: readonly BatchJob[]): BatchSummary => {
  const summary: Record<BatchJobState, number> = {
    pending: 0,
    running: 0,
    done: 0,
    done_with_warnings: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
  }
  jobs.forEach((job) => {
    summary[job.state] += 1
  })
  return summary
}
