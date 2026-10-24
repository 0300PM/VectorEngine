export interface ZipEntryInput {
  filename: string
  data: Uint8Array
  compressible?: boolean
}

export interface ParsedZipEntry {
  filename: string
  compressionMethod: number
  crc32: number
  compressedSize: number
  uncompressedSize: number
  data: Uint8Array
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
    }
    table[index] = value >>> 0
  }
  return table
})()

export const computeCrc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff
  for (let index = 0; index < data.byteLength; index += 1) {
    crc = crcTable[(crc ^ data[index]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const deflateRawIfBeneficial = async (data: Uint8Array): Promise<{ method: 0 | 8; payload: Uint8Array }> => {
  if (data.byteLength < 128 || typeof CompressionStream === 'undefined') {
    return { method: 0, payload: data }
  }
  try {
    const stream = new CompressionStream('deflate-raw')
    const writer = stream.writable.getWriter()
    const copy = new Uint8Array(data.byteLength)
    copy.set(data)
    await writer.write(copy)
    await writer.close()
    const chunks: Uint8Array[] = []
    const reader = stream.readable.getReader()
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
      total += value.byteLength
    }
    if (total >= data.byteLength) {
      return { method: 0, payload: data }
    }
    const compressed = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      compressed.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { method: 8, payload: compressed }
  } catch {
    return { method: 0, payload: data }
  }
}

const inflateRaw = async (data: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') {
    return data
  }
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  await writer.write(copy)
  await writer.close()
  const chunks: Uint8Array[] = []
  const reader = stream.readable.getReader()
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
    total += value.byteLength
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export const createZipArchive = async (entries: ZipEntryInput[]): Promise<Uint8Array> => {
  const encoder = new TextEncoder()
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let localOffset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.filename)
    const crc = computeCrc32(entry.data)
    const shouldCompress = entry.compressible ?? /\.(svg|bmp|json|txt)$/i.test(entry.filename)
    const { method, payload } = shouldCompress
      ? await deflateRawIfBeneficial(entry.data)
      : { method: 0 as const, payload: entry.data }

    const localHeader = new Uint8Array(30 + nameBytes.byteLength)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0x0800, true)
    localView.setUint16(8, method, true)
    localView.setUint16(10, 0, true)
    localView.setUint16(12, 0x21, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, payload.byteLength, true)
    localView.setUint32(22, entry.data.byteLength, true)
    localView.setUint16(26, nameBytes.byteLength, true)
    localView.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, method, true)
    centralView.setUint16(12, 0, true)
    centralView.setUint16(14, 0x21, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, payload.byteLength, true)
    centralView.setUint32(24, entry.data.byteLength, true)
    centralView.setUint16(28, nameBytes.byteLength, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, localOffset, true)
    centralHeader.set(nameBytes, 46)

    localChunks.push(localHeader, payload)
    centralChunks.push(centralHeader)
    localOffset += localHeader.byteLength + payload.byteLength
  }

  let centralSize = 0
  for (const chunk of centralChunks) {
    centralSize += chunk.byteLength
  }

  const endRecord = new Uint8Array(22)
  const endView = new DataView(endRecord.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, localOffset, true)
  endView.setUint16(20, 0, true)

  const archive = new Uint8Array(localOffset + centralSize + endRecord.byteLength)
  let cursor = 0
  for (const chunk of localChunks) {
    archive.set(chunk, cursor)
    cursor += chunk.byteLength
  }
  for (const chunk of centralChunks) {
    archive.set(chunk, cursor)
    cursor += chunk.byteLength
  }
  archive.set(endRecord, cursor)
  return archive
}

export const parseZipArchive = async (archive: Uint8Array): Promise<ParsedZipEntry[]> => {
  const decoder = new TextDecoder('utf-8')
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  let eocdOffset = -1
  for (let pos = archive.byteLength - 22; pos >= Math.max(0, archive.byteLength - 65_557); pos -= 1) {
    if (view.getUint32(pos, true) === 0x06054b50) {
      eocdOffset = pos
      break
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid ZIP archive: missing end of central directory record')
  }

  const count = view.getUint16(eocdOffset + 8, true)
  let cursor = view.getUint32(eocdOffset + 16, true)
  const results: ParsedZipEntry[] = []

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory entry')
    }
    const compressionMethod = view.getUint16(cursor + 10, true)
    const crc32 = view.getUint32(cursor + 16, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const nameLen = view.getUint16(cursor + 28, true)
    const extraLen = view.getUint16(cursor + 30, true)
    const commentLen = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const filename = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLen))

    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const rawSlice = archive.subarray(dataStart, dataStart + compressedSize)
    const data = compressionMethod === 8 ? await inflateRaw(rawSlice) : new Uint8Array(rawSlice)

    results.push({
      filename,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      data,
    })

    cursor += 46 + nameLen + extraLen + commentLen
  }

  return results
}
