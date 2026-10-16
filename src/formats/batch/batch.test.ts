import { describe, expect, it } from 'vitest'
import { createDocument, createLayer, createRectangle, serializeDocument } from '@/core/document'
import { createNodeExportContext } from '@/test-support/node-export'
import { readZip } from '../archive/zip'
import { documentScope, type ExportSet } from '../export-set/types'
import { createVariant } from '../export-set/variants'
import { encodeText } from '../types'
import { BATCH_REPORT_FILE_NAME, createBatchArchive, packageBatchOutputs } from './package'
import { createBatchProcessor } from './processor'
import { BatchQueue, clampConcurrency, hashInput } from './queue'
import { summarizeJobs, type BatchInput, type BatchJob, type BatchProcessor } from './types'

const input = (fileName: string, text: string, relativePath = fileName): BatchInput => ({
  fileName,
  relativePath,
  bytes: encodeText(text),
})

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const waitForIdle = async (queue: BatchQueue): Promise<void> => {
  for (let attempt = 0; attempt < 200 && !queue.isIdle; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

type Deferred = { resolve: () => void; promise: Promise<void> }

const deferred = (): Deferred => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { resolve, promise }
}

const svgDocument = (color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect x="2" y="2" width="6" height="6" fill="${color}"/></svg>`

describe('batch queue', () => {
  it('limits concurrency, continues after failures and tracks states', async () => {
    const gates = new Map<string, Deferred>()
    let active = 0
    let peak = 0
    const processor: BatchProcessor = async (job) => {
      active += 1
      peak = Math.max(peak, active)
      const gate = deferred()
      gates.set(job.input.fileName, gate)
      await gate.promise
      active -= 1
      if (job.input.fileName === 'bad.svg') {
        throw new Error('boom')
      }
      return { outputs: [], warnings: job.input.fileName === 'warn.svg' ? ['legacy_format'] : [] }
    }
    const snapshots: string[][] = []
    const queue = new BatchQueue({
      processor,
      concurrency: 2,
      onChange: (jobs) => snapshots.push(jobs.map((job) => job.state)),
    })
    queue.add([input('a.svg', 'a'), input('bad.svg', 'b'), input('warn.svg', 'c')])
    await flush()
    expect(queue.jobs.map((job) => job.state)).toEqual(['running', 'running', 'pending'])
    gates.get('a.svg')?.resolve()
    await flush()
    expect(queue.jobs.map((job) => job.state)).toEqual(['done', 'running', 'running'])
    gates.get('bad.svg')?.resolve()
    gates.get('warn.svg')?.resolve()
    await waitForIdle(queue)
    expect(queue.jobs.map((job) => job.state)).toEqual(['done', 'failed', 'done_with_warnings'])
    expect(queue.jobs[1]?.error).toBe('boom')
    expect(peak).toBe(2)
    expect(summarizeJobs(queue.jobs)).toMatchObject({ done: 1, failed: 1, done_with_warnings: 1 })
    expect(snapshots.length).toBeGreaterThan(3)
  })

  it('supports pause, resume, cancel, retry, reorder and cleanup', async () => {
    const gates: Deferred[] = []
    const processor: BatchProcessor = async (_job, signal) => {
      const gate = deferred()
      gates.push(gate)
      await gate.promise
      if (signal.aborted) {
        throw new Error('aborted')
      }
      return { outputs: [], warnings: [] }
    }
    const queue = new BatchQueue({ processor, concurrency: 1 })
    queue.pause()
    const [first, second, third] = queue.add([
      input('1.svg', '1'),
      input('2.svg', '2'),
      input('3.svg', '3'),
    ])
    expect(queue.jobs.every((job) => job.state === 'pending')).toBe(true)

    queue.move(third!.id, -2)
    expect(queue.jobs.map((job) => job.input.fileName)).toEqual(['3.svg', '1.svg', '2.svg'])
    queue.move(third!.id, -1)
    expect(queue.jobs[0]?.input.fileName).toBe('3.svg')

    queue.cancel(second!.id)
    expect(queue.jobs.find((job) => job.id === second!.id)?.state).toBe('cancelled')

    queue.resume()
    await flush()
    expect(queue.jobs[0]?.state).toBe('running')
    queue.cancel(third!.id)
    gates[0]?.resolve()
    await flush()
    expect(queue.jobs[0]?.state).toBe('cancelled')
    expect(queue.jobs.find((job) => job.id === first!.id)?.state).toBe('running')
    gates[1]?.resolve()
    await waitForIdle(queue)

    queue.retry(second!.id)
    await flush()
    gates[2]?.resolve()
    await waitForIdle(queue)
    expect(queue.jobs.find((job) => job.id === second!.id)?.state).toBe('done')

    queue.remove(third!.id)
    expect(queue.jobs).toHaveLength(2)
    queue.clearFinished()
    expect(queue.jobs).toHaveLength(0)
  })

  it('detects duplicates by content hash and clamps concurrency', async () => {
    const queue = new BatchQueue({
      processor: async () => ({ outputs: [], warnings: [] }),
      concurrency: 99,
    })
    queue.pause()
    const jobs = queue.add([
      input('a.svg', 'same'),
      input('copy.svg', 'same'),
      input('b.svg', 'other'),
    ])
    expect(jobs.map((job) => job.state)).toEqual(['pending', 'skipped', 'pending'])
    expect(jobs[1]?.duplicateOf).toBe(jobs[0]?.id)
    expect(hashInput(encodeText('same'))).toBe(hashInput(encodeText('same')))
    expect(queue.concurrency).toBe(8)
    expect(clampConcurrency(0)).toBe(2)
    expect(clampConcurrency(-3)).toBe(1)
    queue.setSkipDuplicates(false)
    expect(queue.add([input('again.svg', 'same')])[0]?.state).toBe('pending')
  })
})

describe('batch processor and packaging', () => {
  const set: ExportSet = {
    name: 'png + svg',
    scope: documentScope,
    variants: [
      createVariant({ id: 'png', format: 'png', size: { mode: 'fixed', width: 8, height: 8 } }),
      createVariant({ id: 'svg', format: 'svg' }),
    ],
  }
  const context = createNodeExportContext()

  it('converts each input through the registry and the export set', async () => {
    const processor = createBatchProcessor({ set, context })
    const queue = new BatchQueue({ processor, concurrency: 2 })
    const native = serializeDocument(
      createDocument({
        name: 'Native',
        width: 10,
        height: 10,
        layers: [
          createLayer([
            createRectangle(
              { x: 0, y: 0, width: 5, height: 5 },
              { style: { fill: { color: '#ff0000' } } },
            ),
          ]),
        ],
      }),
    )
    queue.add([
      input('Logo One.svg', svgDocument('#ff0000'), 'brand/Logo One.svg'),
      input('native.json', native, 'native.json'),
      input('broken.svg', '<svg', 'broken.svg'),
      input('notes.txt', 'hello', 'notes.txt'),
      input('logo-copy.svg', svgDocument('#ff0000'), 'other/logo-copy.svg'),
    ])
    await waitForIdle(queue)
    expect(queue.jobs.map((job) => job.state)).toEqual([
      'done',
      'done',
      'failed',
      'failed',
      'skipped',
    ])
    expect(queue.jobs[0]?.outputs.map((output) => output.fileName)).toEqual([
      'logo-one.png',
      'logo-one.svg',
    ])
    expect(queue.jobs[0]?.outputs[0]?.report.sourceFormat).toBe('svg')
    expect(queue.jobs[1]?.outputs[0]?.report.sourceFormat).toBe('document-json')
    expect(queue.jobs[2]?.error).toContain('broken.svg')
    expect(queue.jobs[3]?.error).toContain('unsupported file type')

    const archive = await createBatchArchive(queue.jobs, {
      conflictPolicy: 'rename',
      keepStructure: true,
    })
    const entries = readZip(new Uint8Array(await archive.blob.arrayBuffer()))
    expect([...entries.keys()].sort()).toEqual([
      BATCH_REPORT_FILE_NAME,
      'brand/logo-one.png',
      'brand/logo-one.svg',
      'native.png',
      'native.svg',
    ])
    expect(archive.fileCount).toBe(4)
    expect(archive.report.summary).toMatchObject({ done: 2, failed: 2, skipped: 1 })
    expect(archive.report.jobs[0]?.outputs[0]?.path).toBe('brand/logo-one.png')
    expect(archive.report.jobs[4]?.duplicateOf).toBe(archive.report.jobs[0]?.id)
    const parsed = JSON.parse(new TextDecoder().decode(entries.get(BATCH_REPORT_FILE_NAME)))
    expect(parsed.reportVersion).toBe(1)
  })

  it('applies name conflict policies when flattening the structure', () => {
    const blob = new Blob(['x'])
    const report = {
      sourceFormat: 'svg',
      targetFormat: 'png',
      fileName: 'logo.png',
      createdAt: '',
      processedObjects: 1,
      skippedObjects: 0,
      warningCount: 0,
      issues: [],
      transformations: [],
      validation: 'passed' as const,
    }
    const job = (id: string, relativePath: string): BatchJob => ({
      id,
      input: { fileName: 'logo.svg', relativePath, bytes: new Uint8Array(0) },
      hash: id,
      state: 'done',
      outputs: [{ fileName: 'logo.png', blob, report }],
      warnings: [],
    })
    const jobs = [job('1', 'a/logo.svg'), job('2', 'b/logo.svg'), job('3', 'c/logo.svg')]

    const renamedResult = packageBatchOutputs(jobs, {
      conflictPolicy: 'rename',
      keepStructure: false,
    })
    expect(renamedResult.files.map((file) => file.path)).toEqual([
      'logo.png',
      'logo (2).png',
      'logo (3).png',
    ])
    expect(renamedResult.files[1]?.renamedFrom).toBe('logo.png')

    const skipped = packageBatchOutputs(jobs, { conflictPolicy: 'skip', keepStructure: false })
    expect(skipped.files.map((file) => file.jobId)).toEqual(['1'])
    expect(skipped.dropped.map((item) => [item.jobId, item.reason])).toEqual([
      ['2', 'skipped'],
      ['3', 'skipped'],
    ])

    const overwritten = packageBatchOutputs(jobs, {
      conflictPolicy: 'overwrite',
      keepStructure: false,
    })
    expect(overwritten.files.map((file) => file.jobId)).toEqual(['3'])
    expect(overwritten.dropped.map((item) => item.jobId)).toEqual(['1', '2'])

    const structured = packageBatchOutputs(jobs, { conflictPolicy: 'skip', keepStructure: true })
    expect(structured.files.map((file) => file.path)).toEqual([
      'a/logo.png',
      'b/logo.png',
      'c/logo.png',
    ])
  })
})
