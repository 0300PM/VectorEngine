import type { DocumentReader, DocumentWriter, ReadInput } from './types'
import { hasExtension } from './types'

export class FormatRegistry {
  readonly #readers: DocumentReader[] = []
  readonly #writers: DocumentWriter[] = []

  get readers(): readonly DocumentReader[] {
    return this.#readers
  }

  get writers(): readonly DocumentWriter[] {
    return this.#writers
  }

  registerReader(reader: DocumentReader): this {
    this.#readers.push(reader)
    return this
  }

  registerWriter(writer: DocumentWriter): this {
    this.#writers.push(writer)
    return this
  }

  findReader(input: ReadInput): DocumentReader | undefined {
    const candidates = this.#readers.filter((reader) =>
      hasExtension(input.fileName, reader.extensions),
    )
    return candidates.find((reader) => reader.matches(input)) ?? candidates[0]
  }

  findWriter(formatId: string): DocumentWriter | undefined {
    return this.#writers.find((writer) => writer.id === formatId)
  }

  acceptedFileTypes(): string {
    const tokens = new Set<string>()
    for (const reader of this.#readers) {
      reader.extensions.forEach((extension) => tokens.add(extension))
      tokens.add(reader.mimeType)
    }
    return [...tokens].join(',')
  }
}
