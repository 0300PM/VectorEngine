import { createBrowserSurface } from '@/engine'
import type { ExportSetContext } from '@/formats'
import { formatRegistry } from './formats'
import { useDocumentStore } from '../stores/document'
import { NATIVE_SOURCE_FORMAT } from '../stores/files'
import { useRenderStore } from '../stores/render'

export const createExportContext = (signal?: AbortSignal): ExportSetContext => {
  const renderStore = useRenderStore()
  const documentStore = useDocumentStore()
  return {
    registry: formatRegistry,
    render: (scene) => renderStore.render(scene),
    createSurface: createBrowserSurface,
    sourceFormat: documentStore.importReport?.formatId ?? NATIVE_SOURCE_FORMAT,
    ...(signal ? { signal } : {}),
  }
}
