export type NamedFile = {
  readonly file: File
  readonly relativePath: string
}

type EntryLike = {
  readonly isFile: boolean
  readonly isDirectory: boolean
  readonly fullPath: string
  file?(resolve: (file: File) => void, reject: (error: unknown) => void): void
  createReader?(): {
    readEntries(resolve: (entries: EntryLike[]) => void, reject: (error: unknown) => void): void
  }
}

const readEntryFile = (entry: EntryLike): Promise<File> =>
  new Promise((resolve, reject) => entry.file?.(resolve, reject))

const readDirectory = async (entry: EntryLike): Promise<EntryLike[]> => {
  const reader = entry.createReader?.()
  if (!reader) {
    return []
  }
  const all: EntryLike[] = []
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (batch.length === 0) {
      return all
    }
    all.push(...batch)
  }
}

const walkEntry = async (entry: EntryLike, output: NamedFile[]): Promise<void> => {
  if (entry.isFile) {
    const file = await readEntryFile(entry)
    output.push({ file, relativePath: entry.fullPath.replace(/^\//, '') })
    return
  }
  if (entry.isDirectory) {
    for (const child of await readDirectory(entry)) {
      await walkEntry(child, output)
    }
  }
}

export const filesFromList = (files: Iterable<File>): NamedFile[] =>
  Array.from(files, (file) => ({ file, relativePath: file.webkitRelativePath || file.name }))

export const filesFromDataTransfer = async (transfer: DataTransfer): Promise<NamedFile[]> => {
  const entries = Array.from(transfer.items, (item) =>
    'webkitGetAsEntry' in item ? (item.webkitGetAsEntry() as EntryLike | null) : null,
  )
  if (entries.some((entry) => entry !== null)) {
    const output: NamedFile[] = []
    for (const entry of entries) {
      if (entry) {
        await walkEntry(entry, output)
      }
    }
    return output
  }
  return filesFromList(transfer.files)
}
