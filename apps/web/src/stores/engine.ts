import { computed, reactive, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { defaultScene } from '@/data/defaultScene'
import { createBackend } from '@/engine/createBackend'
import { VectorEngineError } from '@/engine/errors'
import { engineLimits } from '@/engine/limits'
import type {
  EngineBackend,
  ExportFormat,
  ExportResult,
  ExportSettings,
  RenderResult,
  RenderState,
  ValidationIssue,
} from '@/types/engine'
import type { SceneObject, VectorScene } from '@/types/scene'

const initialSettings = (): ExportSettings => ({
  format: 'png',
  width: 1200,
  height: 800,
  scale: 1,
  lockAspect: true,
  backgroundMode: 'document',
  background: '#FFFFFF',
  quality: 90,
})

const countObjects = (objects: SceneObject[]): number => objects.reduce(
  (total, object) => total + 1 + (object.type === 'group' ? countObjects(object.children) : 0),
  0,
)

export const useEngineStore = defineStore('engine', () => {
  const source = ref(defaultScene)
  const documentName = ref('Orbit study')
  const backend = shallowRef<EngineBackend | null>(null)
  const backendName = ref('Initializing engine')
  const renderState = ref<RenderState>('idle')
  const issues = ref<ValidationIssue[]>([])
  const scene = shallowRef<VectorScene | null>(null)
  const preview = shallowRef<RenderResult | null>(null)
  const lastDuration = ref(0)
  const lastRenderedAt = ref<Date | null>(null)
  const isStale = ref(false)
  const settings = reactive<ExportSettings>(initialSettings())
  let renderVersion = 0
  let dimensionsTouched = false

  const errors = computed(() => issues.value.filter((issue) => issue.severity === 'error'))
  const warnings = computed(() => issues.value.filter((issue) => issue.severity === 'warning'))
  const valid = computed(() => errors.value.length === 0 && scene.value !== null)
  const objectCount = computed(() => scene.value ? countObjects(scene.value.objects) : 0)
  const outputWidth = computed(() => Math.max(1, Math.round(settings.width * settings.scale)))
  const outputHeight = computed(() => Math.max(1, Math.round(settings.height * settings.scale)))
  const outputValid = computed(() => outputWidth.value <= engineLimits.outputDimension &&
    outputHeight.value <= engineLimits.outputDimension &&
    outputWidth.value * outputHeight.value <= engineLimits.outputPixels)
  const canExport = computed(() => valid.value && outputValid.value && renderState.value !== 'exporting' && renderState.value !== 'initializing')

  const initialize = async (): Promise<void> => {
    if (backend.value) {
      return
    }
    renderState.value = 'initializing'
    backend.value = await createBackend()
    backendName.value = backend.value.name
    await render()
  }

  const render = async (): Promise<void> => {
    const activeBackend = backend.value
    if (!activeBackend) {
      return
    }

    const version = ++renderVersion
    const startedAt = performance.now()
    renderState.value = 'validating'

    try {
      const validation = await activeBackend.validate(source.value)
      if (version !== renderVersion) {
        return
      }
      issues.value = validation.issues
      scene.value = validation.scene ?? null

      if (!validation.valid || !validation.scene) {
        renderState.value = 'error'
        isStale.value = true
        lastDuration.value = performance.now() - startedAt
        return
      }

      if (!dimensionsTouched) {
        settings.width = validation.scene.document.width
        settings.height = validation.scene.document.height
      }

      renderState.value = 'rendering'
      const result = await activeBackend.renderSvg(source.value)
      if (version !== renderVersion) {
        return
      }

      preview.value = result
      renderState.value = 'ready'
      isStale.value = false
      lastDuration.value = performance.now() - startedAt
      lastRenderedAt.value = new Date()
    } catch (error) {
      if (version !== renderVersion) {
        return
      }
      const engineError = error instanceof VectorEngineError ? error : null
      issues.value = engineError?.issues.length
        ? engineError.issues
        : [{
            code: engineError?.code ?? 'engine.unknown',
            message: error instanceof Error ? error.message : 'Rendering failed',
            path: '$',
            severity: 'error',
          }]
      scene.value = null
      renderState.value = 'error'
      isStale.value = true
      lastDuration.value = performance.now() - startedAt
    }
  }

  const setSource = (value: string): void => {
    source.value = value
    isStale.value = true
  }

  const formatSource = (): void => {
    const parsed = JSON.parse(source.value) as unknown
    source.value = JSON.stringify(parsed, null, 2)
    isStale.value = true
  }

  const reset = (): void => {
    source.value = defaultScene
    documentName.value = 'Orbit study'
    Object.assign(settings, initialSettings())
    dimensionsTouched = false
    isStale.value = true
  }

  const setFormat = (format: ExportFormat): void => {
    settings.format = format
    if (format === 'jpeg' && settings.backgroundMode === 'transparent') {
      settings.backgroundMode = 'custom'
      settings.background = '#FFFFFF'
    }
  }

  const setWidth = (width: number): void => {
    const previousWidth = settings.width
    settings.width = Math.min(engineLimits.outputDimension, Math.max(1, Math.round(width)))
    if (settings.lockAspect && previousWidth > 0) {
      settings.height = Math.max(1, Math.round(settings.height * settings.width / previousWidth))
    }
    dimensionsTouched = true
  }

  const setHeight = (height: number): void => {
    const previousHeight = settings.height
    settings.height = Math.min(engineLimits.outputDimension, Math.max(1, Math.round(height)))
    if (settings.lockAspect && previousHeight > 0) {
      settings.width = Math.max(1, Math.round(settings.width * settings.height / previousHeight))
    }
    dimensionsTouched = true
  }

  const resetDimensions = (): void => {
    if (!scene.value) {
      return
    }
    settings.width = scene.value.document.width
    settings.height = scene.value.document.height
    settings.scale = 1
    dimensionsTouched = false
  }

  const resolveBackground = (): string | null => {
    if (settings.backgroundMode === 'transparent') {
      return null
    }
    if (settings.backgroundMode === 'custom') {
      return settings.background
    }
    const documentBackground = scene.value?.document.background
    return documentBackground && documentBackground !== 'none' ? documentBackground : null
  }

  const dispose = (): void => {
    renderVersion += 1
    backend.value?.destroy?.()
    backend.value = null
    renderState.value = 'idle'
  }

  const exportDocument = async (): Promise<ExportResult> => {
    const activeBackend = backend.value
    if (!activeBackend) {
      throw new VectorEngineError('engine.unavailable', 'The rendering engine is not initialized')
    }

    renderState.value = 'exporting'
    try {
      const result = await activeBackend.export(source.value, {
        format: settings.format,
        width: outputWidth.value,
        height: outputHeight.value,
        quality: settings.quality,
        background: resolveBackground(),
      })
      renderState.value = 'ready'
      return result
    } catch (error) {
      renderState.value = 'error'
      throw error
    }
  }

  return {
    source,
    documentName,
    backendName,
    renderState,
    issues,
    scene,
    preview,
    lastDuration,
    lastRenderedAt,
    isStale,
    settings,
    errors,
    warnings,
    valid,
    objectCount,
    outputWidth,
    outputHeight,
    outputValid,
    canExport,
    initialize,
    render,
    setSource,
    formatSource,
    reset,
    setFormat,
    setWidth,
    setHeight,
    resetDimensions,
    exportDocument,
    dispose,
  }
})
