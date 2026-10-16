import { mkdir, readFile, writeFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'

const schemaUrl = new URL('../schemas/vector-scene.schema.json', import.meta.url)
const outputUrl = new URL('../apps/web/src/engine/generated/sceneValidator.js', import.meta.url)
const schema = JSON.parse(await readFile(schemaUrl, 'utf8'))
delete schema.$id

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
  code: {
    source: true,
    esm: true,
    optimize: true,
  },
})

const validate = ajv.compile(schema)
let output = standaloneCode(ajv, validate)
output = output.replace(
  /const (func\d+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/,
  'const $1 = value => Array.from(value).length;',
)

if (output.includes('require(')) {
  throw new Error('Standalone validator contains an unsupported runtime require')
}

output = `${output}\n`
let current = ''

try {
  current = await readFile(outputUrl, 'utf8')
} catch {
  current = ''
}

if (current !== output) {
  await mkdir(new URL('.', outputUrl), { recursive: true })
  await writeFile(outputUrl, output)
  process.stdout.write('Generated standalone scene validator\n')
} else {
  process.stdout.write('Standalone scene validator is current\n')
}
