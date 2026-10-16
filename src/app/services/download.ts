const REVOKE_DELAY_MS = 1000

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

export { slugify } from '@/formats'
