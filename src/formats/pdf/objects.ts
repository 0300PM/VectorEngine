import { encodeText } from '../types'

export type PdfObjectBody = string | Uint8Array

const concatenate = (chunks: readonly Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

const toBytes = (body: PdfObjectBody): Uint8Array =>
  typeof body === 'string' ? encodeText(body) : body

export const formatPdfNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const rounded = Number(value.toFixed(4))
  if (Object.is(rounded, -0) || rounded === 0) {
    return '0'
  }
  return Math.abs(rounded) < 1e-4 || Math.abs(rounded) >= 1e15
    ? rounded.toFixed(4)
    : String(rounded)
}

export const pdfLiteralString = (bytes: Uint8Array): string => {
  let output = '('
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      output += `\\${String.fromCharCode(byte)}`
    } else if (byte < 0x20 || byte > 0x7e) {
      output += `\\${byte.toString(8).padStart(3, '0')}`
    } else {
      output += String.fromCharCode(byte)
    }
  }
  return `${output})`
}

export const pdfTextString = (text: string): string => {
  const ascii = [...text].every((character) => {
    const code = character.codePointAt(0) ?? 0
    return code >= 0x20 && code <= 0x7e
  })
  if (ascii) {
    return pdfLiteralString(encodeText(text))
  }
  const units = ['FEFF']
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0xfffd
    if (codePoint > 0xffff) {
      const offset = codePoint - 0x10000
      units.push((0xd800 + (offset >> 10)).toString(16).padStart(4, '0'))
      units.push((0xdc00 + (offset & 0x3ff)).toString(16).padStart(4, '0'))
    } else {
      units.push(codePoint.toString(16).padStart(4, '0'))
    }
  }
  return `<${units.join('').toUpperCase()}>`
}

export const pdfDate = (iso: string | undefined, fallback: Date): string | undefined => {
  const date = iso === undefined ? fallback : new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `(D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(
    date.getUTCHours(),
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z)`
}

export const streamObject = (dictionaryEntries: string, data: Uint8Array): Uint8Array =>
  concatenate([
    encodeText(
      `<< /Length ${data.byteLength}${dictionaryEntries ? ` ${dictionaryEntries}` : ''} >>\nstream\n`,
    ),
    data,
    encodeText('\nendstream'),
  ])

export class PdfObjectTable {
  readonly #bodies: (PdfObjectBody | undefined)[] = []

  reserve(): number {
    this.#bodies.push(undefined)
    return this.#bodies.length
  }

  set(objectNumber: number, body: PdfObjectBody): void {
    this.#bodies[objectNumber - 1] = body
  }

  add(body: PdfObjectBody): number {
    const objectNumber = this.reserve()
    this.set(objectNumber, body)
    return objectNumber
  }

  serialize(root: number, info: number): Uint8Array {
    const chunks: Uint8Array[] = [
      encodeText('%PDF-1.4\n'),
      Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a),
    ]
    let offset = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    const offsets: number[] = []
    this.#bodies.forEach((body, index) => {
      if (body === undefined) {
        throw new Error(`PDF object ${index + 1} was reserved but never written`)
      }
      offsets.push(offset)
      const parts = [encodeText(`${index + 1} 0 obj\n`), toBytes(body), encodeText('\nendobj\n')]
      for (const part of parts) {
        chunks.push(part)
        offset += part.byteLength
      }
    })
    const xrefOffset = offset
    const entries = offsets.map((position) => `${String(position).padStart(10, '0')} 00000 n \n`)
    const xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${entries.join('')}`
    const trailer = `trailer\n<< /Size ${offsets.length + 1} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    chunks.push(encodeText(xref), encodeText(trailer))
    return concatenate(chunks)
  }
}
