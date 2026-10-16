import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { bytesToBlob } from '../types'

export const ZIP_MIME_TYPE = 'application/zip'

export type ArchiveEntry = {
  readonly path: string
  readonly bytes: Uint8Array
}

const storedExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'pdf', 'ico', 'zip', 'vex'])

const compressionLevel = (path: string): 0 | 6 => {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return storedExtensions.has(extension) ? 0 : 6
}

export const normalizeArchivePath = (path: string): string =>
  path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .join('/')

export const createZip = (entries: readonly ArchiveEntry[]): Uint8Array => {
  const zippable: Zippable = {}
  for (const entry of entries) {
    const path = normalizeArchivePath(entry.path)
    if (path.length > 0) {
      zippable[path] = [entry.bytes, { level: compressionLevel(path) }]
    }
  }
  return zipSync(zippable)
}

export const createZipBlob = (entries: readonly ArchiveEntry[]): Blob =>
  bytesToBlob(createZip(entries), ZIP_MIME_TYPE)

export const readZip = (bytes: Uint8Array): ReadonlyMap<string, Uint8Array> =>
  new Map(Object.entries(unzipSync(bytes)))

export const textEntry = (path: string, text: string): ArchiveEntry => ({
  path,
  bytes: strToU8(text),
})

export const blobToBytes = async (blob: Blob): Promise<Uint8Array> =>
  new Uint8Array(await blob.arrayBuffer())
