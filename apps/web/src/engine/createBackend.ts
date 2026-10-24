import type { EngineBackend } from '@/types/engine'
import { BrowserBackend } from './browserBackend'
import { WasmBackend } from './wasmBackend'
import { WorkerBackend } from './workerBackend'

export const createBackend = async (): Promise<EngineBackend> => {
  const baseUrl = import.meta.env.BASE_URL
  try {
    return await WorkerBackend.create(baseUrl)
  } catch {
    try {
      return await WasmBackend.create(baseUrl)
    } catch {
      return new BrowserBackend()
    }
  }
}

export const createEngineBackend = createBackend
