import type { EngineBackend } from '@/types/engine'
import { BrowserBackend } from './browserBackend'
import { WasmBackend } from './wasmBackend'

export const createBackend = async (): Promise<EngineBackend> => {
  try {
    return await WasmBackend.create()
  } catch {
    return new BrowserBackend()
  }
}
