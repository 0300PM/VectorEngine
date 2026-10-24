import type {
  BackendExportOptions,
  BackendExportResult,
  EngineBackend,
  ExportRegion,
  ExportTarget,
  RenderOptions,
  RenderResult,
  ValidationResult,
} from '@/types/engine'
import { VectorEngineError } from './errors'
import type { WorkerRequest, WorkerResponse } from './exportWorker'

interface QueuedTask<T> {
  buildRequest: (id: number) => WorkerRequest
  signal?: AbortSignal
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export class WorkerBackend implements EngineBackend {
  name = 'C++23 · WebAssembly'
  readonly isWorker = true
  private worker: Worker | null = null
  private nextId = 1
  private initPromise: Promise<void> | null = null
  private readonly queue: QueuedTask<unknown>[] = []
  private activeTask: {
    id: number
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
    cleanupAbort?: () => void
  } | null = null

  constructor(private readonly baseUrl = '/') {}

  static async create(baseUrl = '/'): Promise<WorkerBackend> {
    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers are not available in this environment')
    }
    const instance = new WorkerBackend(baseUrl)
    await instance.ensureWorker()
    return instance
  }

  private spawnWorker(): Worker {
    const worker = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (!this.activeTask || this.activeTask.id !== msg.id) {
        return
      }
      const task = this.activeTask
      this.activeTask = null
      task.cleanupAbort?.()

      if (msg.ok) {
        this.name = msg.backendName
        task.resolve(msg.result)
      } else {
        task.reject(new VectorEngineError(msg.code, msg.message, msg.issues))
      }
      void this.pumpQueue()
    }
    worker.onerror = (event) => {
      const current = this.activeTask
      this.activeTask = null
      current?.cleanupAbort?.()
      this.terminateCurrentWorker()
      current?.reject(new VectorEngineError('worker.crash', event.message || 'Export worker terminated unexpectedly'))
      void this.pumpQueue()
    }
    return worker
  }

  private terminateCurrentWorker(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.initPromise = null
  }

  private ensureWorker(): Promise<void> {
    if (this.worker && !this.initPromise) {
      return Promise.resolve()
    }
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      try {
        const worker = this.spawnWorker()
        this.worker = worker
        const initId = this.nextId++
        this.activeTask = {
          id: initId,
          resolve: () => {
            this.initPromise = null
            resolve()
          },
          reject: (err) => {
            this.terminateCurrentWorker()
            reject(err)
          },
        }
        worker.postMessage({ id: initId, type: 'init', baseUrl: this.baseUrl } satisfies WorkerRequest)
      } catch (error) {
        this.terminateCurrentWorker()
        reject(error)
      }
    })
    return this.initPromise
  }

  private enqueue<T>(buildRequest: (id: number) => WorkerRequest, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(new VectorEngineError('export.cancelled', 'Export operation cancelled'))
    }

    return new Promise<T>((resolve, reject) => {
      const entry: QueuedTask<unknown> = {
        buildRequest,
        ...(signal ? { signal } : {}),
        resolve: resolve as (value: unknown) => void,
        reject,
      }
      this.queue.push(entry)
      void this.pumpQueue()
    })
  }

  private async pumpQueue(): Promise<void> {
    if (this.activeTask || this.queue.length === 0) {
      return
    }

    const next = this.queue.shift()!
    if (next.signal?.aborted) {
      next.reject(new VectorEngineError('export.cancelled', 'Export operation cancelled'))
      void this.pumpQueue()
      return
    }

    try {
      await this.ensureWorker()
    } catch (error) {
      next.reject(error)
      void this.pumpQueue()
      return
    }

    if (!this.worker || this.activeTask) {
      this.queue.unshift(next)
      return
    }

    const id = this.nextId++
    const signalRef = next.signal
    const onAbort = (): void => {
      if (this.activeTask?.id === id) {
        const abortedTask = this.activeTask
        this.activeTask = null
        abortedTask.cleanupAbort?.()
        this.terminateCurrentWorker()
        abortedTask.reject(new VectorEngineError('export.cancelled', 'Export operation cancelled'))
        void this.pumpQueue()
      }
    }

    if (signalRef) {
      signalRef.addEventListener('abort', onAbort, { once: true })
    }

    this.activeTask = {
      id,
      resolve: next.resolve,
      reject: next.reject,
      ...(signalRef ? { cleanupAbort: () => signalRef.removeEventListener('abort', onAbort) } : {}),
    }

    this.worker.postMessage(next.buildRequest(id))
  }

  validate(source: string): Promise<ValidationResult> {
    return this.enqueue((id) => ({ id, type: 'validate', source }))
  }

  renderSvg(source: string, options?: RenderOptions): Promise<RenderResult> {
    return this.enqueue((id) => ({
      id,
      type: 'renderSvg',
      source,
      ...(options ? { options } : {}),
    }))
  }

  export(source: string, options: BackendExportOptions): Promise<BackendExportResult> {
    const { signal, ...serializableOptions } = options
    return this.enqueue((id) => ({ id, type: 'export', source, options: serializableOptions }), signal)
  }

  measureBounds(source: string, target: ExportTarget, includeHidden = false): Promise<ExportRegion | null> {
    return this.enqueue((id) => ({ id, type: 'measureBounds', source, target, includeHidden }))
  }

  destroy(): void {
    this.dispose()
  }

  dispose(): void {
    this.terminateCurrentWorker()
    while (this.queue.length > 0) {
      const task = this.queue.shift()
      task?.reject(new VectorEngineError('export.cancelled', 'Backend disposed'))
    }
  }
}
