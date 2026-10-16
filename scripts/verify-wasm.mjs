import { readFile } from 'node:fs/promises'

const loaderUrl = new URL('../apps/web/public/wasm/vector_engine.js', import.meta.url)
const binaryUrl = new URL('../apps/web/public/wasm/vector_engine.wasm', import.meta.url)

const [loader, binary] = await Promise.all([
  readFile(loaderUrl, 'utf8'),
  readFile(binaryUrl),
])

if (!loader.includes('createVectorEngineModule')) {
  throw new Error('WebAssembly loader does not expose createVectorEngineModule')
}

const expectedHeader = [0x00, 0x61, 0x73, 0x6d]
if (binary.length < 8 || expectedHeader.some((value, index) => binary[index] !== value)) {
  throw new Error('WebAssembly binary has an invalid header')
}

process.stdout.write(`Verified WebAssembly artifacts (${binary.length.toLocaleString()} bytes)\n`)
