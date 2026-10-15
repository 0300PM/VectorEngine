import { z } from 'zod'
import { CURRENT_SCHEMA_VERSION, DOCUMENT_GENERATOR, type VectorDocument } from '@/core/document'

export const VEX_FORMAT_VERSION = 1
export const VEX_MIME_TYPE = 'application/vnd.vector-engine.vex+zip'
export const VEX_EXTENSION = '.vex'

export const vexEntries = Object.freeze({
  manifest: 'manifest.json',
  document: 'document.json',
  thumbnail: 'previews/thumbnail.png',
})

export const vexManifestSchema = z.object({
  format: z.literal('vex'),
  formatVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  documentId: z.string().min(1),
  generator: z.object({ name: z.string(), version: z.string().optional() }).optional(),
  createdAt: z.iso.datetime().optional(),
  requiredFeatures: z.array(z.string()).default([]),
  assets: z.array(z.object({ id: z.string(), path: z.string(), mimeType: z.string() })).default([]),
})

export type VexManifest = z.output<typeof vexManifestSchema>

export type ManifestOptions = { readonly createdAt?: Date; readonly hasThumbnail?: boolean }

const collectRequiredFeatures = (document: VectorDocument, options: ManifestOptions): string[] => {
  const features = new Set<string>()
  if (options.hasThumbnail) {
    features.add('previews')
  }
  if (document.assets.length > 0) {
    features.add('assets')
  }
  return [...features]
}

export const createManifest = (
  document: VectorDocument,
  options: ManifestOptions = {},
): VexManifest => ({
  format: 'vex',
  formatVersion: VEX_FORMAT_VERSION,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  documentId: document.id,
  generator: { name: DOCUMENT_GENERATOR },
  createdAt: (options.createdAt ?? new Date()).toISOString(),
  requiredFeatures: collectRequiredFeatures(document, options),
  assets: document.assets.map((asset) => ({
    id: asset.id,
    path: asset.path,
    mimeType: asset.mimeType,
  })),
})
