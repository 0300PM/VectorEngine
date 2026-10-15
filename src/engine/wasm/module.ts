export type VectorEngineModule = {
  readonly HEAPU8: Uint8Array
  readonly HEAPF64: Float64Array
  _malloc(size: number): number
  _free(pointer: number): void
  _vex_protocol_version(): number
  _vex_renderer_create(width: number, height: number): number
  _vex_renderer_destroy(handle: number): void
  _vex_renderer_render(handle: number, commands: number, length: number): number
  _vex_renderer_pixels(handle: number): number
}

export type VectorEngineModuleFactory = (options?: {
  locateFile?: (path: string, prefix: string) => string
}) => Promise<VectorEngineModule>

type GlueModule = { default: VectorEngineModuleFactory }

export const loadVectorEngineModule = async (glueUrl: string): Promise<VectorEngineModule> => {
  const glue = (await import(/* @vite-ignore */ glueUrl)) as GlueModule
  if (typeof glue.default !== 'function') {
    throw new TypeError(`Module at ${glueUrl} does not export an Emscripten factory`)
  }
  return glue.default()
}
