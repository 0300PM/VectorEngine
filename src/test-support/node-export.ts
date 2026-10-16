import { createCanvas } from '@napi-rs/canvas'
import { DOMParser } from '@xmldom/xmldom'
import { Canvas2DEngine, type Canvas2DSurface, type SurfaceFactory } from '@/engine'
import {
  bytesToBlob,
  createDefaultFormatRegistry,
  type ExportRenderer,
  type ExportSetContext,
  type FormatRegistry,
  type XmlParser,
} from '@/formats'

type BlobSurface = Canvas2DSurface & {
  convertToBlob(options: { type: string; quality?: number }): Promise<Blob>
}

const PERCENT = 100

export const createNodeSurface: SurfaceFactory = (width, height) => {
  const canvas = createCanvas(width, height)
  const surface = canvas as unknown as BlobSurface
  surface.convertToBlob = async ({ type, quality }) => {
    const percent = Math.round((quality ?? 1) * PERCENT)
    const encoded =
      type === 'image/jpeg'
        ? await canvas.encode('jpeg', percent)
        : type === 'image/webp'
          ? await canvas.encode('webp', percent)
          : await canvas.encode('png')
    return bytesToBlob(new Uint8Array(encoded), type)
  }
  return surface
}

export const nodeXmlParser: XmlParser = (text) => {
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level === 'fatalError') {
        throw new SyntaxError(message)
      }
    },
  })
  return parser.parseFromString(text, 'image/svg+xml') as unknown as Document
}

export const createNodeRegistry = (): FormatRegistry =>
  createDefaultFormatRegistry({ xmlParser: nodeXmlParser })

export const createNodeRenderer = (): ExportRenderer => {
  const engine = new Canvas2DEngine(createNodeSurface)
  return (scene) => engine.render(scene)
}

export const createNodeExportContext = (
  overrides: Partial<ExportSetContext> = {},
): ExportSetContext => ({
  registry: createNodeRegistry(),
  render: createNodeRenderer(),
  createSurface: createNodeSurface,
  sourceFormat: 'document',
  ...overrides,
})
