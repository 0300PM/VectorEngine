import type { PathCommand } from '@/core/geometry'
import { supportsPathOps, type VectorEngineModule } from './module'
import {
  decodePathCommands,
  decodePathMeasure,
  encodePathCommands,
  PATH_MEASURE_LENGTH,
  RenderStatus,
  renderStatusLabel,
  type PathMeasure,
} from './protocol'

const BYTES_PER_DOUBLE = Float64Array.BYTES_PER_ELEMENT
const BYTES_PER_SIZE = 4
const DEFAULT_TOLERANCE = 0.01

export class PathOpsError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Path operation failed: ${renderStatusLabel(status)}`)
    this.name = 'PathOpsError'
    this.status = status
  }
}

export type PathOps = {
  measure(commands: readonly PathCommand[], tolerance?: number): PathMeasure
  simplify(commands: readonly PathCommand[], tolerance: number): PathCommand[]
}

type PathOpsModule = VectorEngineModule &
  Required<Pick<VectorEngineModule, '_vex_path_measure' | '_vex_path_simplify'>>

class WasmPathOps implements PathOps {
  readonly #module: PathOpsModule

  constructor(module: PathOpsModule) {
    this.#module = module
  }

  measure(commands: readonly PathCommand[], tolerance = DEFAULT_TOLERANCE): PathMeasure {
    return this.#withInput(commands, (input, length) => {
      const output = this.#allocate(PATH_MEASURE_LENGTH * BYTES_PER_DOUBLE)
      try {
        const status = this.#module._vex_path_measure(
          input,
          length,
          tolerance,
          output,
          PATH_MEASURE_LENGTH,
        )
        if (status !== RenderStatus.ok) {
          throw new PathOpsError(status)
        }
        return decodePathMeasure(this.#doubles(output, PATH_MEASURE_LENGTH))
      } finally {
        this.#module._free(output)
      }
    })
  }

  simplify(commands: readonly PathCommand[], tolerance: number): PathCommand[] {
    return this.#withInput(commands, (input, length) => {
      const required = this.#allocate(BYTES_PER_SIZE)
      try {
        const probe = this.#module._vex_path_simplify(input, length, tolerance, 0, 0, required)
        if (probe !== RenderStatus.bufferTooSmall && probe !== RenderStatus.ok) {
          throw new PathOpsError(probe)
        }
        const capacity = this.#size(required)
        const output = this.#allocate(Math.max(capacity, 1) * BYTES_PER_DOUBLE)
        try {
          const status = this.#module._vex_path_simplify(
            input,
            length,
            tolerance,
            output,
            capacity,
            required,
          )
          if (status !== RenderStatus.ok) {
            throw new PathOpsError(status)
          }
          return decodePathCommands(this.#doubles(output, this.#size(required)))
        } finally {
          this.#module._free(output)
        }
      } finally {
        this.#module._free(required)
      }
    })
  }

  #withInput<T>(commands: readonly PathCommand[], run: (pointer: number, length: number) => T): T {
    const encoded = encodePathCommands(commands)
    const pointer = this.#allocate(encoded.byteLength)
    try {
      this.#module.HEAPF64.set(encoded, pointer / BYTES_PER_DOUBLE)
      return run(pointer, encoded.length)
    } finally {
      this.#module._free(pointer)
    }
  }

  #allocate(bytes: number): number {
    const pointer = this.#module._malloc(bytes)
    if (pointer === 0) {
      throw new PathOpsError(RenderStatus.invalidValue)
    }
    return pointer
  }

  #doubles(pointer: number, length: number): Float64Array {
    return this.#module.HEAPF64.slice(
      pointer / BYTES_PER_DOUBLE,
      pointer / BYTES_PER_DOUBLE + length,
    )
  }

  #size(pointer: number): number {
    const view = new DataView(this.#module.HEAPU8.buffer, pointer, BYTES_PER_SIZE)
    return view.getUint32(0, true)
  }
}

export const createPathOps = (module: VectorEngineModule): PathOps | undefined =>
  supportsPathOps(module) ? new WasmPathOps(module) : undefined
