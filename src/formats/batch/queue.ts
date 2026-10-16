import { fnv1a } from '../raster/binary'
import {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  finishedStates,
  retryableStates,
  type BatchInput,
  type BatchJob,
  type BatchJobState,
  type BatchProcessor,
} from './types'

export type BatchQueueOptions = {
  readonly processor: BatchProcessor
  readonly concurrency?: number
  readonly skipDuplicates?: boolean
  readonly onChange?: (jobs: readonly BatchJob[]) => void
  readonly now?: () => number
}

export const hashInput = (bytes: Uint8Array): string =>
  `${fnv1a(bytes).toString(16).padStart(8, '0')}-${bytes.length}`

export const clampConcurrency = (value: number): number =>
  Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.floor(value) || DEFAULT_CONCURRENCY))

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class BatchQueue {
  readonly #processor: BatchProcessor
  readonly #onChange: (jobs: readonly BatchJob[]) => void
  readonly #now: () => number
  readonly #running = new Map<string, AbortController>()
  #jobs: readonly BatchJob[] = []
  #concurrency: number
  #skipDuplicates: boolean
  #paused = false
  #sequence = 0

  constructor(options: BatchQueueOptions) {
    this.#processor = options.processor
    this.#onChange = options.onChange ?? (() => undefined)
    this.#now = options.now ?? (() => Date.now())
    this.#concurrency = clampConcurrency(options.concurrency ?? DEFAULT_CONCURRENCY)
    this.#skipDuplicates = options.skipDuplicates ?? true
  }

  get jobs(): readonly BatchJob[] {
    return this.#jobs
  }

  get concurrency(): number {
    return this.#concurrency
  }

  get isPaused(): boolean {
    return this.#paused
  }

  get activeCount(): number {
    return this.#running.size
  }

  get isIdle(): boolean {
    return this.#running.size === 0 && !this.#jobs.some((job) => job.state === 'pending')
  }

  setConcurrency(value: number): void {
    this.#concurrency = clampConcurrency(value)
    this.#pump()
  }

  setSkipDuplicates(value: boolean): void {
    this.#skipDuplicates = value
  }

  add(inputs: readonly BatchInput[]): readonly BatchJob[] {
    const added: BatchJob[] = []
    const next = [...this.#jobs]
    for (const input of inputs) {
      const hash = hashInput(input.bytes)
      const duplicateOf = this.#skipDuplicates
        ? next.find((job) => job.hash === hash && job.state !== 'skipped')?.id
        : undefined
      this.#sequence += 1
      const job: BatchJob = {
        id: `job-${this.#sequence}`,
        input,
        hash,
        state: duplicateOf ? 'skipped' : 'pending',
        outputs: [],
        warnings: [],
        ...(duplicateOf ? { duplicateOf } : {}),
      }
      next.push(job)
      added.push(job)
    }
    this.#commit(next)
    this.#pump()
    return added
  }

  pause(): void {
    this.#paused = true
    this.#commit(this.#jobs)
  }

  resume(): void {
    this.#paused = false
    this.#commit(this.#jobs)
    this.#pump()
  }

  cancel(jobId: string): void {
    const controller = this.#running.get(jobId)
    if (controller) {
      controller.abort()
      return
    }
    const job = this.#find(jobId)
    if (job?.state === 'pending') {
      this.#patch(jobId, { state: 'cancelled', finishedAt: this.#now() })
    }
  }

  cancelAll(): void {
    this.#jobs.forEach((job) => {
      if (job.state === 'pending' || job.state === 'running') {
        this.cancel(job.id)
      }
    })
  }

  retry(jobId: string): void {
    const job = this.#find(jobId)
    if (job && retryableStates.has(job.state)) {
      const reset: BatchJob = {
        id: job.id,
        input: job.input,
        hash: job.hash,
        state: 'pending',
        outputs: [],
        warnings: [],
      }
      this.#commit(this.#jobs.map((candidate) => (candidate.id === jobId ? reset : candidate)))
      this.#pump()
    }
  }

  retryFailed(): void {
    this.#jobs.forEach((job) => {
      if (job.state === 'failed' || job.state === 'cancelled') {
        this.retry(job.id)
      }
    })
  }

  remove(jobId: string): void {
    const job = this.#find(jobId)
    if (job && job.state !== 'running') {
      this.#commit(this.#jobs.filter((candidate) => candidate.id !== jobId))
    }
  }

  move(jobId: string, offset: number): void {
    const index = this.#jobs.findIndex((job) => job.id === jobId)
    const target = index + offset
    if (index === -1 || target < 0 || target >= this.#jobs.length) {
      return
    }
    const next = [...this.#jobs]
    const [job] = next.splice(index, 1)
    if (job) {
      next.splice(target, 0, job)
      this.#commit(next)
    }
  }

  clearFinished(): void {
    this.#commit(this.#jobs.filter((job) => !finishedStates.has(job.state)))
  }

  #find(jobId: string): BatchJob | undefined {
    return this.#jobs.find((job) => job.id === jobId)
  }

  #commit(jobs: readonly BatchJob[]): void {
    this.#jobs = jobs
    this.#onChange(jobs)
  }

  #patch(jobId: string, patch: Partial<BatchJob>): void {
    this.#commit(this.#jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job)))
  }

  #pump(): void {
    while (!this.#paused && this.#running.size < this.#concurrency) {
      const next = this.#jobs.find((job) => job.state === 'pending')
      if (!next) {
        return
      }
      void this.#run(next.id)
    }
  }

  async #run(jobId: string): Promise<void> {
    const controller = new AbortController()
    this.#running.set(jobId, controller)
    this.#patch(jobId, { state: 'running', startedAt: this.#now() })
    const job = this.#find(jobId)
    let patch: Partial<BatchJob>
    try {
      if (!job) {
        throw new Error(`Job ${jobId} disappeared`)
      }
      const result = await this.#processor(job, controller.signal)
      const state: BatchJobState = controller.signal.aborted
        ? 'cancelled'
        : result.warnings.length > 0 ||
            result.outputs.some((output) => output.report.warningCount > 0)
          ? 'done_with_warnings'
          : 'done'
      patch = { state, outputs: result.outputs, warnings: result.warnings }
    } catch (error) {
      patch = controller.signal.aborted
        ? { state: 'cancelled' }
        : { state: 'failed', error: describeError(error) }
    }
    this.#running.delete(jobId)
    if (this.#find(jobId)) {
      this.#patch(jobId, { ...patch, finishedAt: this.#now() })
    }
    this.#pump()
  }
}
