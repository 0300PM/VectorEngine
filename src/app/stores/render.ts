import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { buildRenderScene, scaleRenderScene, type PixelSize, type RenderScene } from '@/core/scene'
import { engineKinds, type EngineKind, type RenderResult } from '@/engine'
import { engineProvider } from '../services/engine'
import { useDocumentStore } from './document'
import { useStatusStore } from './status'

export const ENGINE_PREFERENCE_STORAGE_KEY = 'vector-engine.engine'

type RenderOutcome = { readonly result: RenderResult; readonly fallbackReason?: string }

const isEngineKind = (value: unknown): value is EngineKind =>
  typeof value === 'string' && (engineKinds as readonly string[]).includes(value)

const readStoredPreference = (): EngineKind => {
  const stored = globalThis.localStorage?.getItem(ENGINE_PREFERENCE_STORAGE_KEY)
  return isEngineKind(stored) ? stored : 'wasm'
}

export const useRenderStore = defineStore('render', () => {
  const documentStore = useDocumentStore()
  const status = useStatusStore()

  const preference = ref<EngineKind>(readStoredPreference())
  const activeEngine = ref<EngineKind | undefined>(undefined)
  const result = shallowRef<RenderResult | undefined>(undefined)
  const isRendering = ref(false)

  const sceneBuild = computed(() => buildRenderScene(documentStore.document))
  const scene = computed(() => sceneBuild.value.scene)
  const unsupported = computed(() => sceneBuild.value.unsupported)

  let latestRequest = 0

  const renderScene = async (target: RenderScene): Promise<RenderOutcome> => {
    const resolution = await engineProvider.resolve(preference.value)
    const rendered = await resolution.engine.render(target)
    return resolution.fallbackReason
      ? { result: rendered, fallbackReason: resolution.fallbackReason }
      : { result: rendered }
  }

  const renderPreview = async (): Promise<void> => {
    latestRequest += 1
    const request = latestRequest
    isRendering.value = true
    const startedAt = performance.now()
    try {
      const outcome = await renderScene(scene.value)
      if (request !== latestRequest) {
        return
      }
      result.value = outcome.result
      activeEngine.value = outcome.result.engine
      if (outcome.fallbackReason) {
        status.report('status.fallback', 'warning', { reason: outcome.fallbackReason })
      } else {
        status.report('status.rendered', 'success', {
          engine: { messageKey: `engine.${outcome.result.engine}` },
          duration: Math.round(performance.now() - startedAt),
        })
      }
    } catch (error) {
      if (request === latestRequest) {
        status.report('status.renderFailed', 'error', { message: status.describeError(error) })
      }
    } finally {
      if (request === latestRequest) {
        isRendering.value = false
      }
    }
  }

  const renderAt = async (size: PixelSize): Promise<RenderResult> =>
    (await renderScene(scaleRenderScene(scene.value, size))).result

  watch(scene, () => void renderPreview(), { immediate: true })
  watch(preference, (value) => {
    globalThis.localStorage?.setItem(ENGINE_PREFERENCE_STORAGE_KEY, value)
    void renderPreview()
  })

  return {
    preference,
    activeEngine,
    result,
    isRendering,
    scene,
    unsupported,
    renderPreview,
    renderAt,
  }
})
