import { EngineProvider } from '@/engine'

export const WASM_GLUE_URL = `${import.meta.env.BASE_URL}wasm/vector_engine.js`

export const engineProvider = new EngineProvider({ wasmGlueUrl: WASM_GLUE_URL })
