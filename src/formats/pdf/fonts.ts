import type { FontDescription } from '@/core/document'
import { glyphNameFor } from './glyphs'

type FontFamilyGroup = 'Helvetica' | 'Times' | 'Courier'

const faces: Readonly<Record<FontFamilyGroup, readonly [string, string, string, string]>> = {
  Helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  Times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  Courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
}

const exactFamilies = new Set(['helvetica', 'times', 'times-roman', 'times roman', 'courier'])

const familyGroup = (family: string): FontFamilyGroup => {
  if (/courier|mono/.test(family)) {
    return 'Courier'
  }
  if (/times|georgia|garamond|cambria|book|serif/.test(family) && !/sans/.test(family)) {
    return 'Times'
  }
  return 'Helvetica'
}

export type StandardFont = {
  readonly baseFont: string
  readonly substituted: boolean
}

export const resolveStandardFont = (font: FontDescription): StandardFont => {
  const family = font.family.trim().toLowerCase()
  const group = familyGroup(family)
  const bold = font.weight >= 600
  const italic = font.style === 'italic'
  const index = (bold ? 1 : 0) + (italic ? 2 : 0)
  return { baseFont: faces[group][index]!, substituted: !exactFamilies.has(family) }
}

const FIRST_CUSTOM_CODE = 0x80
const LAST_CUSTOM_CODE = 0xff
const REPLACEMENT_CODE = 0x3f
const SPACE_CODE = 0x20

export type EncodedText = {
  readonly bytes: Uint8Array
  readonly replaced: readonly string[]
}

export class PdfFont {
  readonly resourceName: string
  readonly baseFont: string
  readonly #codes = new Map<string, number>()
  readonly #differences: string[] = []

  constructor(resourceName: string, baseFont: string) {
    this.resourceName = resourceName
    this.baseFont = baseFont
  }

  encode(text: string): EncodedText {
    const bytes: number[] = []
    const replaced = new Set<string>()
    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? REPLACEMENT_CODE
      if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) {
        bytes.push(SPACE_CODE)
      } else if (codePoint >= SPACE_CODE && codePoint <= 0x7e) {
        bytes.push(codePoint)
      } else {
        const code = this.#customCode(character, codePoint)
        if (code === undefined) {
          replaced.add(character)
          bytes.push(REPLACEMENT_CODE)
        } else {
          bytes.push(code)
        }
      }
    }
    return { bytes: Uint8Array.from(bytes), replaced: [...replaced] }
  }

  dictionary(): string {
    const encoding =
      this.#differences.length === 0
        ? '/WinAnsiEncoding'
        : `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [${FIRST_CUSTOM_CODE} ${this.#differences
            .map((name) => `/${name}`)
            .join(' ')}] >>`
    return `<< /Type /Font /Subtype /Type1 /BaseFont /${this.baseFont} /Encoding ${encoding} >>`
  }

  #customCode(character: string, codePoint: number): number | undefined {
    const existing = this.#codes.get(character)
    if (existing !== undefined) {
      return existing
    }
    const glyph = glyphNameFor(codePoint)
    const next = FIRST_CUSTOM_CODE + this.#differences.length
    if (!glyph || next > LAST_CUSTOM_CODE) {
      return undefined
    }
    this.#codes.set(character, next)
    this.#differences.push(glyph)
    return next
  }
}

export class PdfFontSet {
  readonly #fonts = new Map<string, PdfFont>()
  readonly #substitutions = new Map<string, string>()

  resolve(font: FontDescription): PdfFont {
    const standard = resolveStandardFont(font)
    if (standard.substituted) {
      this.#substitutions.set(font.family, standard.baseFont)
    }
    const existing = this.#fonts.get(standard.baseFont)
    if (existing) {
      return existing
    }
    const created = new PdfFont(`F${this.#fonts.size + 1}`, standard.baseFont)
    this.#fonts.set(standard.baseFont, created)
    return created
  }

  get fonts(): readonly PdfFont[] {
    return [...this.#fonts.values()]
  }

  get substitutions(): ReadonlyMap<string, string> {
    return this.#substitutions
  }
}
