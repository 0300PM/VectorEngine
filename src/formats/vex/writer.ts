import { zipSync, type Zippable } from 'fflate'
import { serializeDocument, type VectorDocument } from '@/core/document'
import {
  bytesToBlob,
  encodeText,
  type DocumentWriter,
  type FormatWarning,
  type WriteOptions,
} from '../types'
import { createManifest, VEX_EXTENSION, VEX_MIME_TYPE, vexEntries } from './manifest'

const FORMAT_ID = 'vex'

export const vexWriter: DocumentWriter = {
  id: FORMAT_ID,
  label: 'Vector Engine project',
  extensions: [VEX_EXTENSION],
  mimeType: VEX_MIME_TYPE,
  inspect(document: VectorDocument): readonly FormatWarning[] {
    return document.assets.length > 0
      ? [
          {
            code: 'assets_not_embedded',
            detail: document.assets.map((asset) => asset.path).join(', '),
          },
        ]
      : []
  },
  write(document: VectorDocument, options: WriteOptions = {}): Promise<Blob> {
    const manifest = createManifest(document, { hasThumbnail: options.thumbnail !== undefined })
    const entries: Zippable = {
      [vexEntries.manifest]: encodeText(JSON.stringify(manifest, null, 2)),
      [vexEntries.document]: encodeText(serializeDocument(document)),
    }
    if (options.thumbnail) {
      entries[vexEntries.thumbnail] = [options.thumbnail, { level: 0 }]
    }
    const bytes = zipSync(entries, { level: 6 })
    return Promise.resolve(bytesToBlob(bytes, VEX_MIME_TYPE))
  },
}
