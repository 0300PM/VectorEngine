import { documentJsonReader, documentJsonWriter } from './document-json'
import { legacySceneReader } from './legacy-scene'
import { pdfWriter } from './pdf'
import { FormatRegistry } from './registry'
import { browserXmlParser, createSvgReader, createSvgWriter, type XmlParser } from './svg'
import { vexReader, vexWriter } from './vex'

export * from './compatibility'
export * from './document-json'
export * from './legacy-scene'
export * from './pdf'
export * from './raster'
export * from './registry'
export * from './svg'
export * from './types'
export * from './vex'

export type DefaultRegistryOptions = {
  readonly xmlParser?: XmlParser
}

export const createDefaultFormatRegistry = (
  options: DefaultRegistryOptions = {},
): FormatRegistry => {
  const parse = options.xmlParser ?? browserXmlParser
  return new FormatRegistry()
    .registerReader(vexReader)
    .registerReader(documentJsonReader)
    .registerReader(legacySceneReader)
    .registerReader(createSvgReader(parse))
    .registerWriter(vexWriter)
    .registerWriter(documentJsonWriter)
    .registerWriter(createSvgWriter({ parse }))
    .registerWriter(pdfWriter)
}
