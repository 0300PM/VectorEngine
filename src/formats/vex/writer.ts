import { zipSync, type Zippable } from 'fflate'
import { countNodes, serializeDocument, type VectorDocument } from '@/core/document'
import { defineCapabilities } from '../compatibility/features'
import type { WriteResult } from '../compatibility/report'
import { bytesToBlob, encodeText, type DocumentWriter, type WriteOptions } from '../types'
import { createManifest, VEX_EXTENSION, VEX_MIME_TYPE, vexEntries } from './manifest'

const FORMAT_ID = 'vex'

export const vexWriter: DocumentWriter = {
  id: FORMAT_ID,
  label: 'Vector Engine project',
  extensions: [VEX_EXTENSION],
  mimeType: VEX_MIME_TYPE,
  capabilities: defineCapabilities('native', { assets: 'converted' }),
  write(document: VectorDocument, options: WriteOptions = {}): Promise<WriteResult> {
    const manifest = createManifest(document, { hasThumbnail: options.thumbnail !== undefined })
    const entries: Zippable = {
      [vexEntries.manifest]: encodeText(JSON.stringify(manifest, null, 2)),
      [vexEntries.document]: encodeText(serializeDocument(document)),
    }
    if (options.thumbnail) {
      entries[vexEntries.thumbnail] = [options.thumbnail, { level: 0 }]
    }
    const bytes = zipSync(entries, { level: 6 })
    return Promise.resolve({
      blob: bytesToBlob(bytes, VEX_MIME_TYPE),
      processedObjects: countNodes(document),
      skippedObjects: 0,
      transformations: [],
      validation: 'passed',
    })
  },
}
