import { parseColor } from './color'

const writeUint16 = (view: DataView, offset: number, value: number): void => {
  view.setUint16(offset, value, true)
}

const writeUint32 = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value, true)
}

export const encodeBmp24 = (
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  background = '#FFFFFF',
): Uint8Array => {
  const rowStride = Math.ceil((width * 3) / 4) * 4
  const pixelBytes = rowStride * height
  const output = new Uint8Array(54 + pixelBytes)
  const view = new DataView(output.buffer)
  const backgroundColor = parseColor(background) ?? { r: 255, g: 255, b: 255, a: 255 }

  output[0] = 0x42
  output[1] = 0x4d
  writeUint32(view, 2, output.byteLength)
  writeUint32(view, 10, 54)
  writeUint32(view, 14, 40)
  writeUint32(view, 18, width)
  writeUint32(view, 22, height)
  writeUint16(view, 26, 1)
  writeUint16(view, 28, 24)
  writeUint32(view, 34, pixelBytes)
  writeUint32(view, 38, 2835)
  writeUint32(view, 42, 2835)

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - y - 1
    const destinationRow = 54 + y * rowStride
    for (let x = 0; x < width; x += 1) {
      const source = (sourceY * width + x) * 4
      const destination = destinationRow + x * 3
      const alpha = (pixels[source + 3] ?? 0) / 255
      const inverseAlpha = 1 - alpha
      const red = Math.round((pixels[source] ?? 0) * alpha + backgroundColor.r * inverseAlpha)
      const green = Math.round((pixels[source + 1] ?? 0) * alpha + backgroundColor.g * inverseAlpha)
      const blue = Math.round((pixels[source + 2] ?? 0) * alpha + backgroundColor.b * inverseAlpha)
      output[destination] = blue
      output[destination + 1] = green
      output[destination + 2] = red
    }
  }

  return output
}

export const encodeBmp32 = (
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array => {
  const headerBytes = 122
  const rowStride = width * 4
  const pixelBytes = rowStride * height
  const output = new Uint8Array(headerBytes + pixelBytes)
  const view = new DataView(output.buffer)

  output[0] = 0x42
  output[1] = 0x4d
  writeUint32(view, 2, output.byteLength)
  writeUint32(view, 10, headerBytes)
  writeUint32(view, 14, 108)
  writeUint32(view, 18, width)
  writeUint32(view, 22, height)
  writeUint16(view, 26, 1)
  writeUint16(view, 28, 32)
  writeUint32(view, 30, 3)
  writeUint32(view, 34, pixelBytes)
  writeUint32(view, 38, 2835)
  writeUint32(view, 42, 2835)
  writeUint32(view, 54, 0x00ff0000)
  writeUint32(view, 58, 0x0000ff00)
  writeUint32(view, 62, 0x000000ff)
  writeUint32(view, 66, 0xff000000)
  writeUint32(view, 70, 0x73524742)

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - y - 1
    const destinationRow = headerBytes + y * rowStride
    for (let x = 0; x < width; x += 1) {
      const source = (sourceY * width + x) * 4
      const destination = destinationRow + x * 4
      output[destination] = pixels[source + 2] ?? 0
      output[destination + 1] = pixels[source + 1] ?? 0
      output[destination + 2] = pixels[source] ?? 0
      output[destination + 3] = pixels[source + 3] ?? 0
    }
  }

  return output
}
