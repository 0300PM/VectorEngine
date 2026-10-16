import { access, readFile } from 'node:fs/promises'

const rootUrl = new URL('../', import.meta.url)
const configUrl = new URL('vercel.json', rootUrl)
const outputUrl = new URL('apps/web/dist/', rootUrl)
const indexUrl = new URL('index.html', outputUrl)
const loaderUrl = new URL('wasm/vector_engine.js', outputUrl)
const binaryUrl = new URL('wasm/vector_engine.wasm', outputUrl)

await Promise.all([
  access(indexUrl),
  access(loaderUrl),
  access(binaryUrl),
])

const [configSource, index, loader, binary] = await Promise.all([
  readFile(configUrl, 'utf8'),
  readFile(indexUrl, 'utf8'),
  readFile(loaderUrl, 'utf8'),
  readFile(binaryUrl),
])
const config = JSON.parse(configSource)
const securityRule = config.headers.find((rule) => rule.source === '/(.*)')
const policy = securityRule?.headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? ''
const wasmRule = config.headers.find((rule) => rule.source === '/wasm/vector_engine.wasm')
const wasmType = wasmRule?.headers.find((header) => header.key === 'Content-Type')?.value

if (config.outputDirectory !== 'apps/web/dist') {
  throw new Error('Vercel output directory does not match the Vite build')
}
if (!config.rewrites.some((rule) => rule.source === '/(.*)' && rule.destination === '/index.html')) {
  throw new Error('Vercel SPA fallback is missing')
}
if (wasmType !== 'application/wasm') {
  throw new Error('Vercel WebAssembly MIME type is missing')
}
if (!policy.includes("script-src 'self' 'wasm-unsafe-eval'")) {
  throw new Error('Content Security Policy does not permit WebAssembly compilation')
}
if (policy.includes("'unsafe-eval'")) {
  throw new Error('Content Security Policy permits unrestricted JavaScript evaluation')
}
if (!index.includes('type="module"')) {
  throw new Error('Production index does not load an ES module entry point')
}
if (loader.includes('new Function') || loader.includes('eval(')) {
  throw new Error('WebAssembly loader requires dynamic JavaScript evaluation')
}
if (binary.length < 8 || binary[0] !== 0x00 || binary[1] !== 0x61 || binary[2] !== 0x73 || binary[3] !== 0x6d) {
  throw new Error('Deployed WebAssembly binary has an invalid header')
}

process.stdout.write('Verified Vercel output, SPA routing, CSP, and WebAssembly delivery\n')
