import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  BatchQueue,
  DEFAULT_CONCURRENCY,
  createBatchArchive,
  createBatchProcessor,
  serializeBatchReport,
  summarizeJobs,
  type BatchInput,
  type BatchJob,
  type BatchSessionReport,
  type ConflictPolicy,
} from '@/formats'
import { bytesToBlob, encodeText } from '@/formats'
import { downloadBlob } from '../services/download'
import { createExportContext } from '../services/exportContext'
import type { NamedFile } from '../services/fileEntries'
import { useExportSetStore } from './exportSet'
import { useStatusStore } from './status'

export const BATCH_ARCHIVE_PREFIX = 'batch'

export const useBatchStore = defineStore('batch', () => {
  const exportSetStore = useExportSetStore()
  const status = useStatusStore()

  const jobs = shallowRef<readonly BatchJob[]>([])
  const concurrency = ref(DEFAULT_CONCURRENCY)
  const conflictPolicy = ref<ConflictPolicy>('rename')
  const keepStructure = ref(true)
  const skipDuplicates = ref(true)
  const isPaused = ref(true)
  const isPackaging = ref(false)
  const lastReport = shallowRef<BatchSessionReport | undefined>(undefined)

  const queue = new BatchQueue({
    processor: (job, signal) =>
      createBatchProcessor({ set: exportSetStore.set, context: createExportContext() })(
        job,
        signal,
      ),
    concurrency: concurrency.value,
    skipDuplicates: skipDuplicates.value,
    onChange: (next) => {
      jobs.value = next
      isPaused.value = queue.isPaused
    },
  })
  queue.pause()

  const summary = computed(() => summarizeJobs(jobs.value))
  const hasOutputs = computed(() => jobs.value.some((job) => job.outputs.length > 0))
  const isActive = computed(() => summary.value.running > 0)

  const addFiles = async (files: readonly NamedFile[]): Promise<void> => {
    const inputs: BatchInput[] = []
    for (const entry of files) {
      inputs.push({
        fileName: entry.file.name,
        relativePath: entry.relativePath,
        bytes: new Uint8Array(await entry.file.arrayBuffer()),
      })
    }
    const added = queue.add(inputs)
    status.report('status.batchAdded', 'info', { count: added.length })
  }

  const start = (): void => queue.resume()
  const pause = (): void => queue.pause()
  const cancel = (id: string): void => queue.cancel(id)
  const cancelAll = (): void => queue.cancelAll()
  const retry = (id: string): void => queue.retry(id)
  const retryFailed = (): void => queue.retryFailed()
  const remove = (id: string): void => queue.remove(id)
  const move = (id: string, offset: number): void => queue.move(id, offset)
  const clearFinished = (): void => queue.clearFinished()

  const downloadArchive = async (): Promise<void> => {
    if (!hasOutputs.value || isPackaging.value) {
      return
    }
    isPackaging.value = true
    try {
      const archive = await createBatchArchive(jobs.value, {
        conflictPolicy: conflictPolicy.value,
        keepStructure: keepStructure.value,
      })
      lastReport.value = archive.report
      const stamp = archive.report.createdAt.replace(/[:.]/g, '-')
      downloadBlob(archive.blob, `${BATCH_ARCHIVE_PREFIX}-${stamp}.zip`)
      status.report('status.batchPackaged', 'success', { files: archive.fileCount })
    } catch (error) {
      status.report('status.exportFailed', 'error', { message: status.describeError(error) })
    } finally {
      isPackaging.value = false
    }
  }

  const downloadReport = (): void => {
    const report = lastReport.value
    if (report) {
      downloadBlob(
        bytesToBlob(encodeText(serializeBatchReport(report)), 'application/json'),
        `${BATCH_ARCHIVE_PREFIX}-report.json`,
      )
    }
  }

  watch(concurrency, (value) => queue.setConcurrency(value))
  watch(skipDuplicates, (value) => queue.setSkipDuplicates(value))

  return {
    jobs,
    concurrency,
    conflictPolicy,
    keepStructure,
    skipDuplicates,
    isPaused,
    isPackaging,
    isActive,
    hasOutputs,
    summary,
    lastReport,
    addFiles,
    start,
    pause,
    cancel,
    cancelAll,
    retry,
    retryFailed,
    remove,
    move,
    clearFinished,
    downloadArchive,
    downloadReport,
  }
})
