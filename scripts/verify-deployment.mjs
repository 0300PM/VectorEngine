import { access, readdir, readFile } from 'node:fs/promises'

const rootUrl = new URL('../', import.meta.url)
const configUrl = new URL('vercel.json', rootUrl)
const outputUrl = new URL('apps/web/dist/', rootUrl)
const assetsUrl = new URL('assets/', outputUrl)
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

// The responsive scale is authored in CSS, so verify the minified bundle really
// carries every monitor tier instead of trusting the source file alone.
const assetFiles = await readdir(assetsUrl)
const styleFiles = assetFiles.filter((file) => file.endsWith('.css'))
if (styleFiles.length === 0) {
  throw new Error('Production build has no stylesheet')
}
const stylesheet = (
  await Promise.all(styleFiles.map((file) => readFile(new URL(file, assetsUrl), 'utf8')))
).join('\n')

if (!stylesheet.includes('--col-export')) {
  throw new Error('Production stylesheet is missing the workspace column variables')
}

const requiredTiers = [1280, 1366, 1440, 1600, 1680, 1920, 2048, 2560, 3440, 3840, 5120]
const hasTier = (width) =>
  new RegExp(`min-width:\\s*${width}px|width\\s*>=\\s*${width}px`).test(stylesheet)
const missingTiers = requiredTiers.filter((width) => !hasTier(width))
if (missingTiers.length > 0) {
  throw new Error(`Production stylesheet is missing monitor tiers: ${missingTiers.join(', ')}px`)
}

// Brand assets: favicon set, web app manifest, and the social banner.
const brandAssets = [
  'favicon.svg',
  'favicon.ico',
  'favicon-32.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'site.webmanifest',
  'brand/social-card.png',
  'brand/banner-icon.svg',
]
const missingAssets = []
for (const asset of brandAssets) {
  try {
    await access(new URL(asset, outputUrl))
  } catch {
    missingAssets.push(asset)
  }
}
if (missingAssets.length > 0) {
  throw new Error(`Production output is missing brand assets: ${missingAssets.join(', ')}`)
}

const manifest = JSON.parse(await readFile(new URL('site.webmanifest', outputUrl), 'utf8'))
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
  throw new Error('Web app manifest does not declare the icon set')
}
if (!index.includes('rel="icon"') || !index.includes('/brand/social-card.png')) {
  throw new Error('Production index is missing favicon or social banner metadata')
}

process.stdout.write(
  'Verified Vercel output, SPA routing, CSP, WebAssembly delivery, 11 monitor breakpoints, favicon, and banner\n',
)
