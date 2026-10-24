import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VectorEngineError } from './errors'
import type { WorkerRequest, WorkerResponse } from './exportWorker'
import { WorkerBackend } from './workerBackend'

class MockWorker {
  static instances: MockWorker[] = []
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  lastTransfer: Transferable[] | undefined

  constructor() {
    MockWorker.instances.push(this)
  }

  postMessage(message: WorkerRequest, transfer?: Transferable[]): void {
    this.lastTransfer = transfer
    if (message.type === 'init') {
      queueMicrotask(() => {
        if (!this.terminated) {
          this.onmessage?.({
            data: { id: message.id, ok: true, backendName: 'C++23 · WebAssembly', result: { ready: true } },
          } as MessageEvent<WorkerResponse>)
        }
      })
      return
    }

    if (message.type === 'export' && message.options.width === 9999) {
      return
    }

    if (message.type === 'export') {
      const payload = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
      queueMicrotask(() => {
        if (!this.terminated) {
          this.onmessage?.({
            data: {
              id: message.id,
              ok: true,
              backendName: 'C++23 · WebAssembly',
              result: {
                data: payload,
                mimeType: 'image/png',
                extension: 'png',
                width: message.options.width ?? 100,
                height: message.options.height ?? 100,
                hasAlpha: true,
                issues: [],
              },
            },
          } as MessageEvent<WorkerResponse>)
        }
      })
    }
  }

  terminate(): void {
    this.terminated = true
  }
}

describe('WorkerBackend off-main-thread execution and instant cancellation', () => {
  const originalWorker = globalThis.Worker

  beforeEach(() => {
    MockWorker.instances = []
    vi.stubGlobal('Worker', MockWorker)
  })

  afterEach(() => {
    vi.stubGlobal('Worker', originalWorker)
  })

  it('executes exports in a worker, terminates hung jobs immediately on AbortSignal, and recovers cleanly', async () => {
    const backend = await WorkerBackend.create('/')
    expect(backend.name).toBe('C++23 · WebAssembly')
    expect(MockWorker.instances).toHaveLength(1)

    const controller = new AbortController()
    const hungPromise = backend.export('{}', {
      format: 'png',
      width: 9999,
      height: 100,
      quality: 90,
      background: 'transparent',
      signal: controller.signal,
    })

    await Promise.resolve()
    controller.abort()

    await expect(hungPromise).rejects.toBeInstanceOf(VectorEngineError)
    expect(MockWorker.instances[0]?.terminated).toBe(true)

    const nextResult = await backend.export('{}', {
      format: 'png',
      width: 120,
      height: 80,
      quality: 90,
      background: 'transparent',
    })
    expect(MockWorker.instances).toHaveLength(2)
    expect(nextResult.width).toBe(120)
    expect(Array.from(nextResult.data)).toEqual([0x89, 0x50, 0x4e, 0x47])

    backend.dispose()
  })
})
