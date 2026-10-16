import { VectorEngineError } from './errors'

const imageFromSvg = async (svg: string): Promise<HTMLImageElement> => {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const image = new Image()

  try {
    image.src = url
    await image.decode()
    return image
  } catch {
    throw new VectorEngineError('raster.decode', 'The browser could not decode the generated SVG')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const rasterizeSvg = async (
  svg: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!context) {
    throw new VectorEngineError('raster.context', 'A 2D canvas context is not available')
  }

  const image = await imageFromSvg(svg)
  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

export const canvasToBytes = async (
  canvas: HTMLCanvasElement,
  mimeType: 'image/png' | 'image/jpeg',
  quality?: number,
): Promise<Uint8Array> => {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new VectorEngineError('encode.failed', `Failed to encode ${mimeType}`)),
      mimeType,
      quality,
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}
