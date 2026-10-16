export const sanitizeFilename = (name: string): string => {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized || 'vector-scene'
}

export const downloadBytes = (data: Uint8Array, filename: string, mimeType: string): void => {
  const bytes = new Uint8Array(data)
  const blob = new Blob([bytes.buffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const readTextFile = async (file: File, maxBytes: number): Promise<string> => {
  if (file.size > maxBytes) {
    throw new Error(`File exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB input limit`)
  }
  return file.text()
}
