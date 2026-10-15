import { describe, expect, it } from 'vitest'
import { closePath, lineTo, moveTo } from '@/core/geometry'
import type { VectorEngineModule } from './module'
import { createPathOps, PathOpsError } from './pathOps'
import { decodePathCommands, encodePathCommands, RenderStatus } from './protocol'

const HEAP_BYTES = 64 * 1024

const createFakeModule = (options: { failMeasure?: number } = {}) => {
  const buffer = new ArrayBuffer(HEAP_BYTES)
  const HEAPU8 = new Uint8Array(buffer)
  const HEAPF64 = new Float64Array(buffer)
  let next = 64
  const live = new Set<number>()
  const module: VectorEngineModule = {
    HEAPU8,
    HEAPF64,
    _malloc(size) {
      const pointer = next
      next += Math.ceil(size / 8) * 8
      live.add(pointer)
      return pointer
    },
    _free(pointer) {
      live.delete(pointer)
    },
    _vex_protocol_version: () => 1,
    _vex_renderer_create: () => 0,
    _vex_renderer_destroy: () => undefined,
    _vex_renderer_render: () => RenderStatus.ok,
    _vex_renderer_pixels: () => 0,
    _vex_path_measure(commands, length, tolerance, out, outLength) {
      if (options.failMeasure !== undefined) {
        return options.failMeasure
      }
      if (outLength < 13) {
        return RenderStatus.bufferTooSmall
      }
      const decoded = decodePathCommands(HEAPF64.slice(commands / 8, commands / 8 + length))
      HEAPF64.set([decoded.length * 10 + tolerance, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1], out / 8)
      return RenderStatus.ok
    },
    _vex_path_simplify(commands, length, tolerance, out, outCapacity, outLength) {
      const decoded = decodePathCommands(HEAPF64.slice(commands / 8, commands / 8 + length))
      const simplified = encodePathCommands(
        decoded.filter((command) => command.type !== 'L' || tolerance < 1),
      )
      new DataView(buffer).setUint32(outLength, simplified.length, true)
      if (outCapacity < simplified.length) {
        return RenderStatus.bufferTooSmall
      }
      HEAPF64.set(simplified, out / 8)
      return RenderStatus.ok
    },
  }
  return { module, live }
}

const commands = [moveTo(0, 0), lineTo(1, 0), lineTo(1, 1), closePath()]

describe('wasm path ops binding', () => {
  it('is unavailable when the module lacks the exports', () => {
    const { module } = createFakeModule()
    const legacy: VectorEngineModule = { ...module }
    delete legacy._vex_path_measure
    delete legacy._vex_path_simplify
    expect(createPathOps(legacy)).toBeUndefined()
  })

  it('marshals measurements through the heap and frees every allocation', () => {
    const { module, live } = createFakeModule()
    const ops = createPathOps(module)!
    const measure = ops.measure(commands, 0.5)
    expect(measure.length).toBe(40.5)
    expect(measure.exactBounds).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
    expect(measure.allClosed).toBe(true)
    expect(live.size).toBe(0)
  })

  it('probes the required size before simplifying', () => {
    const { module, live } = createFakeModule()
    const ops = createPathOps(module)!
    expect(ops.simplify(commands, 2)).toEqual([moveTo(0, 0), closePath()])
    expect(ops.simplify(commands, 0.1)).toEqual(commands)
    expect(live.size).toBe(0)
  })

  it('surfaces engine status codes as errors', () => {
    const { module, live } = createFakeModule({ failMeasure: RenderStatus.invalidVerb })
    const ops = createPathOps(module)!
    expect(() => ops.measure(commands)).toThrow(PathOpsError)
    expect(() => ops.measure(commands)).toThrow(/invalidVerb/)
    expect(live.size).toBe(0)
  })
})
