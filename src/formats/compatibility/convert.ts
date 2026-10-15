import type { VectorDocument } from '@/core/document'
import { bytesToBlob, encodeText, type DocumentWriter, type WriteOptions } from '../types'
import { analyzeCompatibility } from './analyze'
import type { CompatibilityReport, ConversionReport, WriteResult } from './report'

export type ConversionOutcome = {
  readonly blob: Blob
  readonly report: ConversionReport
}

export type ConversionContext = {
  readonly sourceFormat: string
  readonly fileName: string
}

export const buildConversionReport = (
  context: ConversionContext,
  compatibility: CompatibilityReport,
  result: Omit<WriteResult, 'blob'>,
  now: Date = new Date(),
): ConversionReport => ({
  sourceFormat: context.sourceFormat,
  targetFormat: compatibility.targetId,
  fileName: context.fileName,
  createdAt: now.toISOString(),
  processedObjects: result.processedObjects,
  skippedObjects: result.skippedObjects,
  warningCount: compatibility.summary.warning + compatibility.summary.error,
  issues: compatibility.issues,
  transformations: result.transformations,
  validation: result.validation,
})

export const convertDocument = async (
  writer: DocumentWriter,
  document: VectorDocument,
  context: ConversionContext,
  options: WriteOptions = {},
): Promise<ConversionOutcome> => {
  const compatibility = analyzeCompatibility(document, writer)
  const { blob, ...result } = await writer.write(document, options)
  return { blob, report: buildConversionReport(context, compatibility, result) }
}

export const CONVERSION_REPORT_VERSION = 1
export const CONVERSION_REPORT_MIME_TYPE = 'application/json'

export const serializeConversionReport = (report: ConversionReport): string =>
  JSON.stringify({ reportVersion: CONVERSION_REPORT_VERSION, ...report }, null, 2)

export const conversionReportBlob = (report: ConversionReport): Blob =>
  bytesToBlob(encodeText(serializeConversionReport(report)), CONVERSION_REPORT_MIME_TYPE)

export const conversionReportFileName = (report: ConversionReport): string =>
  `${report.fileName.replace(/\.[^.]+$/, '')}.${report.targetFormat}-report.json`
