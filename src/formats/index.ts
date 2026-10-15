import { documentJsonReader, documentJsonWriter } from './document-json'
import { legacySceneReader } from './legacy-scene'
import { FormatRegistry } from './registry'
import { vexReader, vexWriter } from './vex'

export * from './document-json'
export * from './legacy-scene'
export * from './raster'
export * from './registry'
export * from './types'
export * from './vex'

export const createDefaultFormatRegistry = (): FormatRegistry =>
  new FormatRegistry()
    .registerReader(vexReader)
    .registerReader(documentJsonReader)
    .registerReader(legacySceneReader)
    .registerWriter(vexWriter)
    .registerWriter(documentJsonWriter)
