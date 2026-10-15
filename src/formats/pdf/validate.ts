export type PdfValidation = {
  readonly ok: boolean
  readonly issues: readonly string[]
  readonly objectCount: number
}

const latin1 = (bytes: Uint8Array, start: number, end: number): string =>
  Array.from(bytes.subarray(start, end), (byte) => String.fromCharCode(byte)).join('')

const findLast = (bytes: Uint8Array, needle: string): number => {
  const window = latin1(bytes, Math.max(0, bytes.length - 2048), bytes.length)
  const index = window.lastIndexOf(needle)
  return index < 0 ? -1 : Math.max(0, bytes.length - 2048) + index
}

export const validatePdfStructure = (bytes: Uint8Array): PdfValidation => {
  const issues: string[] = []
  if (bytes.length < 64) {
    return { ok: false, issues: ['file too small'], objectCount: 0 }
  }
  if (latin1(bytes, 0, 8) !== '%PDF-1.4') {
    issues.push('missing header')
  }
  if (!latin1(bytes, Math.max(0, bytes.length - 8), bytes.length).includes('%%EOF')) {
    issues.push('missing %%EOF marker')
  }
  const startxref = findLast(bytes, 'startxref')
  if (startxref < 0) {
    return { ok: false, issues: [...issues, 'missing startxref'], objectCount: 0 }
  }
  const xrefOffset = Number.parseInt(latin1(bytes, startxref + 9, startxref + 40).trim(), 10)
  if (!Number.isInteger(xrefOffset) || xrefOffset <= 0 || xrefOffset >= bytes.length) {
    return { ok: false, issues: [...issues, 'invalid startxref offset'], objectCount: 0 }
  }
  const header = latin1(bytes, xrefOffset, Math.min(bytes.length, xrefOffset + 64))
  const match = /^xref\n0 (\d+)\n/.exec(header)
  if (!match) {
    return {
      ok: false,
      issues: [...issues, 'xref table not found at startxref offset'],
      objectCount: 0,
    }
  }
  const size = Number.parseInt(match[1]!, 10)
  const entriesStart = xrefOffset + match[0].length
  for (let index = 1; index < size; index += 1) {
    const entry = latin1(bytes, entriesStart + index * 20, entriesStart + (index + 1) * 20)
    const parsed = /^(\d{10}) (\d{5}) n \n$/.exec(entry)
    if (!parsed) {
      issues.push(`malformed xref entry ${index}`)
      continue
    }
    const offset = Number.parseInt(parsed[1]!, 10)
    const expected = `${index} 0 obj`
    if (latin1(bytes, offset, offset + expected.length) !== expected) {
      issues.push(`object ${index} not found at offset ${offset}`)
    }
  }
  const trailer = latin1(bytes, entriesStart + size * 20, bytes.length)
  if (!trailer.includes('/Root')) {
    issues.push('trailer missing /Root')
  }
  if (!trailer.includes(`/Size ${size}`)) {
    issues.push('trailer /Size does not match xref')
  }
  return { ok: issues.length === 0, issues, objectCount: size - 1 }
}
