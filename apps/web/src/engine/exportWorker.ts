import type {
  BackendExportOptions,
  BackendExportResult,
  EngineBackend,
  ExportRegion,
  ExportTarget,
  RenderOptions,
  RenderResult,
  ValidationIssue,
  ValidationResult,
} from '@/types/engine'
import { BrowserBackend } from './browserBackend'
import { VectorEngineError } from './errors'
import { WasmBackend } from './wasmBackend'

export type WorkerRequest =
  | { id: number; type: 'init'; baseUrl: string }
  | { id: number; type: 'validate'; source: string }
  | { id: number; type: 'renderSvg'; source: string; options?: RenderOptions }
  | { id: number; type: 'export'; source: string; options: BackendExportOptions }
  | { id: number; type: 'measureBounds'; source: string; target: ExportTarget; includeHidden?: boolean }

export type WorkerResponse =
  | { id: number; ok: true; backendName: string; result: unknown }
  | { id: number; ok: false; code: string; message: string; issues: ValidationIssue[] }

interface DedicatedWorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
}

const workerScope = self as unknown as DedicatedWorkerScope

let activeBackend: EngineBackend | null = null
let baseUrl = '/'

const ensureBackend = async (): Promise<EngineBackend> => {
  if (activeBackend) {
    return activeBackend
  }
  try {
    activeBackend = await WasmBackend.create(baseUrl)
  } catch {
    activeBackend = new BrowserBackend()
  }
  return activeBackend
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const message = event.data
  try {
    if (message.type === 'init') {
      baseUrl = message.baseUrl || '/'
      const backend = await ensureBackend()
      workerScope.postMessage({
        id: message.id,
        ok: true,
        backendName: backend.name,
        result: { ready: true },
      })
      return
    }

    const backend = await ensureBackend()

    if (message.type === 'validate') {
      const result: ValidationResult = await backend.validate(message.source)
      workerScope.postMessage({ id: message.id, ok: true, backendName: backend.name, result })
      return
    }

    if (message.type === 'renderSvg') {
      const result: RenderResult = await backend.renderSvg(message.source, message.options)
      workerScope.postMessage({ id: message.id, ok: true, backendName: backend.name, result })
      return
    }

    if (message.type === 'measureBounds') {
      const result: ExportRegion | null = backend.measureBounds
        ? await backend.measureBounds(message.source, message.target, message.includeHidden)
        : null
      workerScope.postMessage({ id: message.id, ok: true, backendName: backend.name, result })
      return
    }

    if (message.type === 'export') {
      const result: BackendExportResult = await backend.export(message.source, message.options)
      const buffer = result.data.byteOffset === 0 && result.data.byteLength === result.data.buffer.byteLength
        ? result.data.buffer
        : result.data.slice().buffer
      const transferableResult: BackendExportResult = {
        ...result,
        data: new Uint8Array(buffer),
      }
      workerScope.postMessage(
        { id: message.id, ok: true, backendName: backend.name, result: transferableResult },
        [buffer],
      )
    }
  } catch (error) {
    const code = error instanceof VectorEngineError ? error.code : 'worker.error'
    const errMessage = error instanceof Error ? error.message : 'Worker operation failed'
    const issues = error instanceof VectorEngineError ? error.issues : []
    workerScope.postMessage({
      id: message.id,
      ok: false,
      code,
      message: errMessage,
      issues,
    })
  }
}
