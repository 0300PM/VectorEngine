import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { defaultScene } from '@/data/defaultScene'
import { BrowserBackend } from '@/engine/browserBackend'
import { createBackend } from '@/engine/createBackend'
import { VectorEngineError } from '@/engine/errors'
import { cloneScene, collectSceneObjects, findObjectsById, serializeScene } from '@/inspector/sceneTree'
import { BOOLEAN_LABELS } from '@/paths/boolean'
import type { BooleanOperation } from '@/paths/boolean'
import {
  applyPathCommand,
  buildBooleanObject,
  createPathObject,
  nextObjectId,
} from '@/paths/editor'
import { hitTestScene } from '@/canvas/hitTest'
import { createGuide, moveGuide } from '@/canvas/guides'
import type { PathCommand } from '@/paths/editor'
import type { PathModel } from '@/paths/model'
import { parsePathData, serializePathModel } from '@/paths/parser'
import type { PathObject, SceneObject, VectorScene } from '@/types/scene'
import type { PathToolKind } from '@/paths/tools'
import {
  buildExportPreview,
  collectSceneCatalog,
  executeBatchExport,
  executeExport,
  extractScopedScene,
  formatByteSize,
  formatExportFilename,
  resolveExportViewport,
  validateExportOptions,
} from '@/export'
import type {
  BatchExportItemInput,
  BatchExportItemState,
  BatchExportReport,
  BmpBitDepth,
  EditorBackdrop,
  ExportBackground,
  ExportFormat,
  ExportOptions,
  ExportPreviewSnapshot,
  ExportRegion,
  ExportResult,
  ExportScalePreset,
  ExportTarget,
  ExportTargetKind,
  FitMode,
} from '@/export/types'
import type { EngineBackend, RenderResult, RenderState, ValidationIssue } from '@/types/engine'
import { downloadBytes } from '@/utils/file'
import {
  actualSize,
  createView,
  documentSizeOf,
  fitView,
  panBy,
  zoomAt,
  zoomIn,
  zoomOut,
  type Size,
  type ViewState,
} from '@/canvas/view'
import {
  applyPlacements,
  applySizeMatch,
  computeAlignment,
  computeDistribution,
  type AlignEdge,
  type AlignOptions,
  type DistributeAxis,
  type ObjectPlacement,
  type ParentMatrixResolver,
  type ScenePropertySetter,
} from '@/canvas/align'
import { candidatesForBounds, gridLines, type SnapCandidates, type SnapSettings } from '@/canvas/snap'
import { guidesToCandidates, nextGuideId, type Guide, type GuideOrientation } from '@/canvas/guides'
import { selectAt, selectByMarquee, toggleInSelection, type MarqueeMode } from '@/canvas/selection'
import { sceneBounds } from '@/canvas/hitTest'
import { identityMatrix, matrixFromTransform, multiplyMatrix, type AffineMatrix } from '@/export/bounds'
import type { Point } from '@/types/scene'
import { type Bounds, type Rect } from '@/canvas/geometry'

export interface BatchOverrideConfig {
  enabled: boolean
  format?: ExportFormat | undefined
  scale?: ExportScalePreset | undefined
  backgroundHex?: string | undefined
}

const countObjectsTree = (objects: SceneObject[]): number => objects.reduce(
  (total, object) => total + 1 + (object.type === 'group' ? countObjectsTree(object.children) : 0),
  0,
)

export const useEngineStore = defineStore('engine', () => {
  const source = ref(defaultScene)
  const documentName = ref('Orbit study')
  const backend = shallowRef<EngineBackend>(new BrowserBackend())
  const backendName = ref('Browser renderer')
  const renderState = ref<RenderState>('idle')
  const issues = ref<ValidationIssue[]>([])
  const scene = shallowRef<VectorScene | null>(null)
  const preview = shallowRef<RenderResult | null>(null)
  const lastDuration = ref(0)
  const isStale = ref(false)

  const editorBackdrop = ref<EditorBackdrop>('checker')
  const selectedObjectIds = ref<string[]>(['core', 'core-ring'])
  const inspectorLockAspect = ref(true)

  const pathTool = ref<PathToolKind>('select')
  const nodeEditing = ref(false)
  const pathNotice = ref('')
  const selectedSubpath = ref(0)
  const selectedNode = ref(0)

  watch(selectedObjectIds, () => {
    selectedSubpath.value = 0
    selectedNode.value = 0
  }, { flush: 'sync' })

  const setSelectedNode = (subpath: number, node: number): void => {
    selectedSubpath.value = subpath
    selectedNode.value = node
  }

  const targetKind = ref<ExportTargetKind>('scene')
  const selectedGroupId = ref('satellites')
  const selectedLayerId = ref('core-system')
  const selectedSingleObjectId = ref('core')
  const selectedWorkspaceId = ref('hero-card')
  const useCustomWorkspaceRegion = ref(false)
  const customRegion = ref<ExportRegion>({ x: 80, y: 80, width: 1040, height: 640 })

  const exportFormat = ref<ExportFormat>('png')
  const exportScale = ref<ExportScalePreset>(1)
  const scaleMode = ref<'preset' | 'custom'>('preset')
  const customWidth = ref(1200)
  const customHeight = ref(800)
  const lockAspectRatio = ref(true)
  const fitMode = ref<FitMode>('contain')

  const backgroundMode = ref<'document' | 'transparent' | 'custom'>('document')
  const customBackgroundColor = ref('#FFFFFF')

  const jpegQuality = ref(90)
  const bmpBitDepth = ref<BmpBitDepth>(24)
  const margin = ref(0)
  const trimToBounds = ref(false)
  const clipToBounds = ref(false)
  const includeHidden = ref(false)
  const minifySvg = ref(false)
  const filenameTemplate = ref('{document}')

  const batchMode = ref(false)
  const batchScopeKind = ref<'objects' | 'groups' | 'layers'>('objects')
  const batchSelectedIds = ref<string[]>(['core', 'core-ring', 'satellites'])
  const batchOverrides = ref<Record<string, BatchOverrideConfig>>({})
  const batchFilenameTemplate = ref('{document}_{object}_{scale}')
  const packageAsZip = ref(true)

  const exportPreview = shallowRef<ExportPreviewSnapshot | null>(null)
  const lastExportResult = shallowRef<ExportResult | null>(null)
  const batchItemsState = ref<BatchExportItemState[]>([])
  const batchProgressCompleted = ref(0)
  const batchProgressTotal = ref(0)
  const lastBatchReport = shallowRef<BatchExportReport | null>(null)

  const exportMessage = ref('')
  const exportError = ref('')

  let renderVersion = 0
  let exportPreviewToken = 0
  let previewDebounceTimer: ReturnType<typeof setTimeout> | undefined
  let activeAbortController: AbortController | null = null

  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])
  let editAnchor: string | null = null
  let inspectorRenderTimer: ReturnType<typeof setTimeout> | undefined

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  const errors = computed(() => issues.value.filter((issue) => issue.severity === 'error'))
  const warnings = computed(() => issues.value.filter((issue) => issue.severity === 'warning'))
  const hasErrors = computed(() => errors.value.length > 0)
  const valid = computed(() => errors.value.length === 0 && scene.value !== null)
  const exporting = computed(() => renderState.value === 'exporting')

  const objectCount = computed(() => {
    if (!scene.value) {
      return 0
    }
    const fromLayers = (scene.value.layers ?? []).reduce((sum, layer) => sum + countObjectsTree(layer.objects), 0)
    return fromLayers + countObjectsTree(scene.value.objects)
  })

  const sceneCatalog = computed(() => (
    scene.value
      ? collectSceneCatalog(scene.value)
      : { objects: [], groups: [], layers: [], workspaces: [] }
  ))

  const activeTarget = computed<ExportTarget>(() => {
    switch (targetKind.value) {
      case 'scene':
        return { type: 'scene' }
      case 'selection':
        return { type: 'selection', objectIds: [...selectedObjectIds.value] }
      case 'group':
        return { type: 'group', objectId: selectedGroupId.value }
      case 'layer':
        return { type: 'layer', layerId: selectedLayerId.value }
      case 'object':
      case 'objects':
        return { type: 'object', objectId: selectedSingleObjectId.value }
      case 'workspace':
        return useCustomWorkspaceRegion.value
          ? { type: 'workspace', workspaceId: 'custom', region: { ...customRegion.value } }
          : { type: 'workspace', workspaceId: selectedWorkspaceId.value }
    }
  })

  const activeBackground = computed<ExportBackground>(() => {
    if (backgroundMode.value === 'transparent') {
      return 'transparent'
    }
    if (backgroundMode.value === 'custom') {
      return { color: customBackgroundColor.value }
    }
    return 'document'
  })

  const baseViewport = computed(() => {
    if (!scene.value) {
      return {
        viewBox: { x: 0, y: 0, width: 1200, height: 800 },
        aspectRatio: 1.5,
      }
    }
    const scoped = extractScopedScene(scene.value, activeTarget.value, includeHidden.value)
    const resolved = resolveExportViewport(scene.value, scoped, {
      target: activeTarget.value,
      scale: exportScale.value,
      margin: margin.value,
      trimToBounds: trimToBounds.value,
      clipToBounds: clipToBounds.value,
      fitMode: fitMode.value,
      preserveAspectRatio: fitMode.value !== 'stretch',
    })
    return {
      viewBox: resolved.viewBox,
      aspectRatio: resolved.viewBox.width / Math.max(1, resolved.viewBox.height),
    }
  })

  const effectiveDimensions = computed(() => {
    if (scaleMode.value === 'custom') {
      return {
        width: customWidth.value,
        height: customHeight.value,
      }
    }
    return {
      width: Math.max(1, Math.round(baseViewport.value.viewBox.width * exportScale.value)),
      height: Math.max(1, Math.round(baseViewport.value.viewBox.height * exportScale.value)),
    }
  })

  const outputWidth = computed(() => effectiveDimensions.value.width)
  const outputHeight = computed(() => effectiveDimensions.value.height)

  const activeExportOptions = computed<ExportOptions>(() => ({
    format: exportFormat.value,
    target: activeTarget.value,
    ...(scaleMode.value === 'preset'
      ? { scale: exportScale.value }
      : { width: customWidth.value, height: customHeight.value }),
    preserveAspectRatio: fitMode.value !== 'stretch',
    fitMode: fitMode.value,
    margin: margin.value,
    includeHidden: includeHidden.value,
    trimToBounds: trimToBounds.value,
    clipToBounds: clipToBounds.value,
    background: activeBackground.value,
    ...(exportFormat.value === 'jpeg' ? { quality: jpegQuality.value } : {}),
    ...(exportFormat.value === 'svg' ? { minifySvg: minifySvg.value } : {}),
    ...(exportFormat.value === 'bmp' ? { bmpBitDepth: bmpBitDepth.value } : {}),
    documentName: documentName.value,
    filenameTemplate: filenameTemplate.value,
  }))

  const preflightValidation = computed(() => validateExportOptions(activeExportOptions.value, scene.value))
  const outputValid = computed(() => preflightValidation.value.ok)
  const canExport = computed(() => (
    valid.value
    && preflightValidation.value.ok
    && renderState.value !== 'exporting'
    && renderState.value !== 'initializing'
  ))

  const resolvedFilenamePreview = computed(() => formatExportFilename(
    batchMode.value ? batchFilenameTemplate.value : filenameTemplate.value,
    {
      document: documentName.value,
      target: activeTarget.value,
      ...(batchMode.value ? { objectLabel: 'core' } : {}),
      scale: exportScale.value,
      scaleMode: scaleMode.value,
      width: effectiveDimensions.value.width,
      height: effectiveDimensions.value.height,
      format: exportFormat.value,
      index: 0,
    },
  ))

  const batchCandidatePool = computed(() => {
    if (batchScopeKind.value === 'groups') {
      return sceneCatalog.value.groups.map((group) => ({
        id: group.id,
        label: group.label,
        target: { type: 'group', objectId: group.id } as ExportTarget,
      }))
    }
    if (batchScopeKind.value === 'layers') {
      return sceneCatalog.value.layers.map((layer) => ({
        id: layer.id,
        label: layer.label,
        target: { type: 'layer', layerId: layer.id } as ExportTarget,
      }))
    }
    return sceneCatalog.value.objects.map((entry) => ({
      id: entry.id,
      label: entry.label,
      target: entry.type === 'group'
        ? ({ type: 'group', objectId: entry.id } as ExportTarget)
        : ({ type: 'object', objectId: entry.id } as ExportTarget),
    }))
  })

  const syncSelectionDefaults = (nextScene: VectorScene): void => {
    const catalog = collectSceneCatalog(nextScene)
    if (catalog.groups.length > 0 && !catalog.groups.some((g) => g.id === selectedGroupId.value)) {
      selectedGroupId.value = catalog.groups[0]!.id
    }
    if (catalog.layers.length > 0 && !catalog.layers.some((l) => l.id === selectedLayerId.value)) {
      selectedLayerId.value = catalog.layers[0]!.id
    }
    if (catalog.objects.length > 0 && !catalog.objects.some((o) => o.id === selectedSingleObjectId.value)) {
      selectedSingleObjectId.value = catalog.objects[0]!.id
    }
    if (catalog.workspaces.length > 0 && !catalog.workspaces.some((w) => w.id === selectedWorkspaceId.value)) {
      selectedWorkspaceId.value = catalog.workspaces[0]!.id
    }
    const existingIds = new Set(catalog.objects.map((o) => o.id))
    const filteredSel = selectedObjectIds.value.filter((id) => existingIds.has(id))
    if (filteredSel.length !== selectedObjectIds.value.length) {
      selectedObjectIds.value = filteredSel.length > 0
        ? filteredSel
        : catalog.objects.slice(0, 2).map((o) => o.id)
    }
  }

  const refreshExportPreview = async (): Promise<void> => {
    const token = ++exportPreviewToken
    if (!valid.value || !scene.value || !preflightValidation.value.ok) {
      return
    }
    try {
      const snap = await buildExportPreview({
        backend: backend.value,
        source: source.value,
        options: activeExportOptions.value,
      })
      if (token === exportPreviewToken) {
        exportPreview.value = snap
      }
    } catch {
      if (token === exportPreviewToken) {
        exportPreview.value = null
      }
    }
  }

  const scheduleExportPreview = (delay = 65): void => {
    clearTimeout(previewDebounceTimer)
    previewDebounceTimer = setTimeout(() => {
      void refreshExportPreview()
    }, delay)
  }

  const render = async (): Promise<void> => {
    const version = ++renderVersion
    const startedAt = performance.now()
    renderState.value = 'validating'
    exportError.value = ''

    try {
      const validation = await backend.value.validate(source.value)
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

      syncSelectionDefaults(validation.scene)
      renderState.value = 'rendering'
      const result = await backend.value.renderSvg(source.value, {
        scale: 1,
      })
      if (version !== renderVersion) {
        return
      }

      preview.value = result
      renderState.value = 'ready'
      isStale.value = false
      lastDuration.value = performance.now() - startedAt
      if (scaleMode.value === 'preset') {
        customWidth.value = effectiveDimensions.value.width
        customHeight.value = effectiveDimensions.value.height
      }
      await refreshExportPreview()
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

  const initialize = async (): Promise<void> => {
    renderState.value = 'initializing'
    backend.value = await createBackend()
    backendName.value = backend.value.name
    await render()
  }

  const setSource = (value: string): void => {
    source.value = value
    isStale.value = true
    undoStack.value = []
    redoStack.value = []
    editAnchor = null
  }

  const formatSource = (): void => {
    const parsed = JSON.parse(source.value) as unknown
    source.value = JSON.stringify(parsed, null, 2)
    isStale.value = true
  }

  const reset = (): void => {
    source.value = defaultScene
    documentName.value = 'Orbit study'
    targetKind.value = 'scene'
    exportFormat.value = 'png'
    exportScale.value = 1
    scaleMode.value = 'preset'
    lockAspectRatio.value = true
    fitMode.value = 'contain'
    backgroundMode.value = 'document'
    customBackgroundColor.value = '#FFFFFF'
    jpegQuality.value = 90
    bmpBitDepth.value = 24
    margin.value = 0
    trimToBounds.value = false
    clipToBounds.value = false
    includeHidden.value = false
    minifySvg.value = false
    filenameTemplate.value = '{document}'
    batchMode.value = false
    lastExportResult.value = null
    lastBatchReport.value = null
    batchItemsState.value = []
    exportMessage.value = ''
    exportError.value = ''
    undoStack.value = []
    redoStack.value = []
    editAnchor = null
    inspectorLockAspect.value = true
    isStale.value = true
  }

  const setFormat = (format: ExportFormat): void => {
    exportFormat.value = format
    lastExportResult.value = null
    scheduleExportPreview(30)
  }

  const setPresetScale = (preset: ExportScalePreset): void => {
    exportScale.value = preset
    scaleMode.value = 'preset'
    customWidth.value = Math.max(1, Math.round(baseViewport.value.viewBox.width * preset))
    customHeight.value = Math.max(1, Math.round(baseViewport.value.viewBox.height * preset))
    lastExportResult.value = null
    scheduleExportPreview(30)
  }

  const enableCustomScale = (): void => {
    customWidth.value = effectiveDimensions.value.width
    customHeight.value = effectiveDimensions.value.height
    scaleMode.value = 'custom'
    lastExportResult.value = null
    scheduleExportPreview(30)
  }

  const setCustomWidth = (nextWidth: number): void => {
    const safeWidth = Number.isFinite(nextWidth) ? Math.max(1, Math.round(nextWidth)) : 1
    scaleMode.value = 'custom'
    customWidth.value = safeWidth
    if (lockAspectRatio.value) {
      const ratio = baseViewport.value.aspectRatio || 1
      customHeight.value = Math.max(1, Math.round(safeWidth / ratio))
    }
    lastExportResult.value = null
    scheduleExportPreview(50)
  }

  const setCustomHeight = (nextHeight: number): void => {
    const safeHeight = Number.isFinite(nextHeight) ? Math.max(1, Math.round(nextHeight)) : 1
    scaleMode.value = 'custom'
    customHeight.value = safeHeight
    if (lockAspectRatio.value) {
      const ratio = baseViewport.value.aspectRatio || 1
      customWidth.value = Math.max(1, Math.round(safeHeight * ratio))
    }
    lastExportResult.value = null
    scheduleExportPreview(50)
  }

  const resetDimensions = (): void => {
    setPresetScale(1)
  }

  const toggleObjectInSelection = (objectId: string): void => {
    const next = new Set(selectedObjectIds.value)
    if (next.has(objectId)) {
      next.delete(objectId)
    } else {
      next.add(objectId)
    }
    selectedObjectIds.value = [...next]
  }

  const requestInspectorRender = (): void => {
    if (inspectorRenderTimer) {
      clearTimeout(inspectorRenderTimer)
    }
    inspectorRenderTimer = setTimeout(() => {
      inspectorRenderTimer = undefined
      void render()
    }, 120)
  }

  const beginInspectorEdit = (): void => {
    if (editAnchor === null) {
      editAnchor = source.value
    }
  }

  const commitInspectorEdit = (): void => {
    if (editAnchor === null) {
      return
    }
    undoStack.value.push(editAnchor)
    if (undoStack.value.length > 100) {
      undoStack.value.shift()
    }
    editAnchor = null
    redoStack.value = []
  }

  const cancelInspectorEdit = (): void => {
    editAnchor = null
  }

  const applySourceSnapshot = (snapshot: string): void => {
    source.value = snapshot
    try {
      scene.value = JSON.parse(snapshot) as VectorScene
    } catch {
      scene.value = null
    }
    isStale.value = true
    requestInspectorRender()
  }

  const undo = (): void => {
    const previous = undoStack.value.pop()
    if (previous === undefined) {
      return
    }
    redoStack.value.push(source.value)
    applySourceSnapshot(previous)
  }

  const redo = (): void => {
    const next = redoStack.value.pop()
    if (next === undefined) {
      return
    }
    undoStack.value.push(source.value)
    applySourceSnapshot(next)
  }

  const applyObjectPatch = (
    ids: readonly string[],
    write: (object: SceneObject) => Record<string, unknown>,
  ): boolean => {
    if (!scene.value || ids.length === 0) {
      return false
    }
    const nextScene = cloneScene(scene.value)
    const targets = findObjectsById(nextScene, ids)
    if (targets.length === 0) {
      return false
    }
    for (const object of targets) {
      Object.assign(object, write(object))
    }
    source.value = serializeScene(nextScene)
    scene.value = nextScene
    isStale.value = true
    requestInspectorRender()
    return true
  }

  const appendSceneObject = (object: SceneObject): boolean => {
    if (!scene.value) {
      return false
    }
    const nextScene = cloneScene(scene.value)
    nextScene.objects = [...nextScene.objects, object]
    source.value = serializeScene(nextScene)
    scene.value = nextScene
    isStale.value = true
    requestInspectorRender()
    return true
  }

  const createSceneObject = (object: SceneObject): boolean => {
    beginInspectorEdit()
    const created = appendSceneObject(object)
    if (created) {
      commitInspectorEdit()
    } else {
      cancelInspectorEdit()
    }
    return created
  }

  const removeSceneObject = (id: string): boolean => {
    if (!scene.value) {
      return false
    }
    const nextScene = cloneScene(scene.value)
    const before = nextScene.objects.length
    nextScene.objects = nextScene.objects.filter((object) => object.id !== id)
    if (nextScene.objects.length === before) {
      return false
    }
    source.value = serializeScene(nextScene)
    scene.value = nextScene
    selectedObjectIds.value = selectedObjectIds.value.filter((selected) => selected !== id)
    isStale.value = true
    requestInspectorRender()
    return true
  }

  const setSelectedObjectIds = (ids: string[]): void => {
    selectedObjectIds.value = ids
  }

  const setPathTool = (tool: PathToolKind): void => {
    pathTool.value = tool
    nodeEditing.value = tool === 'select'
    if (tool !== 'select') {
      pathNotice.value = ''
    }
  }

  const setNodeEditing = (value: boolean): void => {
    nodeEditing.value = value
  }

  const setPathNotice = (message: string): void => {
    pathNotice.value = message
  }

  const selectedPathObjects = (): PathObject[] => {
    if (!scene.value) {
      return []
    }
    return findObjectsById(scene.value, selectedObjectIds.value).filter(
      (object): object is PathObject => object.type === 'path',
    )
  }

  const applyPathCommandToSelection = (command: PathCommand): boolean => {
    const targets = selectedPathObjects()
    if (targets.length !== 1) {
      return false
    }
    const model = parsePathData(targets[0]!.d)
    const next = applyPathCommand(model, command)
    const d = serializePathModel(next)
    beginInspectorEdit()
    const applied = applyObjectPatch([targets[0]!.id], () => ({ d }))
    if (applied) {
      commitInspectorEdit()
    } else {
      cancelInspectorEdit()
    }
    return applied
  }

  const addPathFromModel = (model: PathModel, name: string): PathObject | null => {
    if (!scene.value) {
      return null
    }
    const object = createPathObject(model, {
      id: nextObjectId(scene.value, 'path'),
      name,
    })
    const created = createSceneObject(object)
    if (created) {
      selectedObjectIds.value = [object.id]
      nodeEditing.value = true
      pathTool.value = 'select'
    }
    return created ? object : null
  }

  const applyBooleanToSelection = (operation: BooleanOperation): boolean => {
    const targets = selectedPathObjects()
    if (targets.length < 2) {
      pathNotice.value = 'Wybierz dwie ścieżki'
      return false
    }
    const [first, second] = targets
    const outcome = buildBooleanObject(
      parsePathData(first!.d),
      parsePathData(second!.d),
      operation,
      {
        id: nextObjectId(scene.value!, 'path'),
        name: `${BOOLEAN_LABELS[operation]} ${first!.name ?? first!.id}`,
      },
    )
    if (!outcome.object) {
      pathNotice.value = outcome.reason
      return false
    }
    pathNotice.value = ''
    const created = createSceneObject(outcome.object)
    if (created) {
      selectedObjectIds.value = [outcome.object.id]
    }
    return created
  }

  const selectInspectorObject = (id: string, additive: boolean): void => {
    if (additive) {
      toggleObjectInSelection(id)
    } else {
      selectedObjectIds.value = [id]
    }
  }

  const toggleInspectorVisibility = (id: string): void => {
    applyObjectPatch([id], (object) => ({
      visible: object.visible === false ? true : false,
    }))
  }

  const setInspectorLockAspect = (value: boolean): void => {
    inspectorLockAspect.value = value
  }

  const toggleBatchCandidate = (id: string): void => {
    const next = new Set(batchSelectedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    batchSelectedIds.value = [...next]
  }

  const setBatchOverride = (id: string, patch: Partial<BatchOverrideConfig>): void => {
    const existing = batchOverrides.value[id] ?? { enabled: false }
    batchOverrides.value = {
      ...batchOverrides.value,
      [id]: { ...existing, ...patch },
    }
  }

  watch(batchScopeKind, () => {
    batchSelectedIds.value = batchCandidatePool.value.slice(0, 3).map((item) => item.id)
  })

  watch(
    [
      targetKind,
      selectedObjectIds,
      selectedGroupId,
      selectedLayerId,
      selectedSingleObjectId,
      selectedWorkspaceId,
      useCustomWorkspaceRegion,
      customRegion,
      exportFormat,
      exportScale,
      scaleMode,
      fitMode,
      backgroundMode,
      customBackgroundColor,
      jpegQuality,
      bmpBitDepth,
      margin,
      trimToBounds,
      clipToBounds,
      includeHidden,
      minifySvg,
      documentName,
    ],
    () => {
      if (scaleMode.value === 'preset') {
        customWidth.value = effectiveDimensions.value.width
        customHeight.value = effectiveDimensions.value.height
      }
      lastExportResult.value = null
      scheduleExportPreview(45)
    },
    { deep: true },
  )

  const cancelActiveExport = (): void => {
    if (activeAbortController) {
      activeAbortController.abort()
      activeAbortController = null
    }
  }

  const exportCurrent = async (): Promise<ExportResult | null> => {
    if (!canExport.value) {
      exportError.value = preflightValidation.value.errors[0]?.message ?? 'Resolve validation errors before exporting'
      return null
    }

    cancelActiveExport()
    const controller = new AbortController()
    activeAbortController = controller

    renderState.value = 'exporting'
    exportError.value = ''
    exportMessage.value = ''
    lastBatchReport.value = null

    try {
      const result = await executeExport({
        backend: backend.value,
        source: source.value,
        options: {
          ...activeExportOptions.value,
          signal: controller.signal,
        },
        documentTitle: documentName.value,
        filenameTemplate: filenameTemplate.value,
      })

      lastExportResult.value = result
      downloadBytes(result.data, result.filename, result.mimeType)
      exportMessage.value = `${result.filename} · ${formatByteSize(result.sizeBytes)}`
      renderState.value = 'ready'
      return result
    } catch (error) {
      if (error instanceof VectorEngineError && error.code === 'export.cancelled') {
        exportMessage.value = 'Export cancelled'
        renderState.value = 'ready'
        return null
      }
      exportError.value = error instanceof Error ? error.message : 'Export failed'
      renderState.value = 'ready'
      throw error
    } finally {
      if (activeAbortController === controller) {
        activeAbortController = null
      }
    }
  }

  const exportBatch = async (): Promise<BatchExportReport | null> => {
    if (!valid.value) {
      exportError.value = 'Resolve validation errors before exporting'
      return null
    }

    const poolById = new Map(batchCandidatePool.value.map((entry) => [entry.id, entry]))
    const inputs: BatchExportItemInput[] = batchSelectedIds.value
      .map((id) => poolById.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => {
        const override = batchOverrides.value[entry.id]
        const itemOverrides: Partial<Omit<ExportOptions, 'target' | 'signal'>> = {}
        if (override?.enabled) {
          if (override.format) {
            itemOverrides.format = override.format
          }
          if (override.scale) {
            itemOverrides.scale = override.scale
          }
          if (override.backgroundHex) {
            itemOverrides.background = { color: override.backgroundHex }
          }
        }
        return {
          id: entry.id,
          label: entry.label,
          target: entry.target,
          ...(Object.keys(itemOverrides).length > 0 ? { options: itemOverrides } : {}),
        }
      })

    if (inputs.length === 0) {
      exportError.value = 'Select at least one item to export'
      return null
    }

    cancelActiveExport()
    const controller = new AbortController()
    activeAbortController = controller

    renderState.value = 'exporting'
    exportError.value = ''
    exportMessage.value = ''
    batchProgressCompleted.value = 0
    batchProgressTotal.value = inputs.length
    batchItemsState.value = []
    lastBatchReport.value = null

    try {
      const report = await executeBatchExport({
        backend: backend.value,
        source: source.value,
        documentName: documentName.value,
        sharedOptions: activeExportOptions.value,
        items: inputs,
        filenameTemplate: batchFilenameTemplate.value,
        packageAsZip: packageAsZip.value,
        signal: controller.signal,
        onProgress: (event) => {
          batchProgressCompleted.value = event.completed
          batchProgressTotal.value = event.total
          batchItemsState.value = event.items
        },
      })

      lastBatchReport.value = report
      batchItemsState.value = report.items
      renderState.value = 'ready'

      if (report.cancelled) {
        exportMessage.value = `Batch export cancelled (${report.succeeded}/${inputs.length} completed)`
      } else if (report.zipData && report.zipFilename) {
        downloadBytes(report.zipData, report.zipFilename, 'application/zip')
        exportMessage.value = `${report.zipFilename} (${report.succeeded} files · ${formatByteSize(report.zipData.byteLength)})`
      } else {
        for (const item of report.items) {
          if (item.status === 'completed' && item.result) {
            downloadBytes(item.result.data, item.filename, item.result.mimeType)
          }
        }
        exportMessage.value = `Exported ${report.succeeded}/${inputs.length} files (${formatByteSize(report.totalBytes)})`
        if (report.failed > 0) {
          exportError.value = `${report.failed} item(s) failed`
        }
      }

      return report
    } catch (error) {
      renderState.value = 'ready'
      exportError.value = error instanceof Error ? error.message : 'Batch export failed'
      throw error
    } finally {
      if (activeAbortController === controller) {
        activeAbortController = null
      }
    }
  }

  const downloadBatchItem = (item: BatchExportItemState): void => {
    if (item.result) {
      downloadBytes(item.result.data, item.filename, item.result.mimeType)
    }
  }

  const downloadBatchZip = (): void => {
    if (lastBatchReport.value?.zipData && lastBatchReport.value.zipFilename) {
      downloadBytes(lastBatchReport.value.zipData, lastBatchReport.value.zipFilename, 'application/zip')
    }
  }

  const dispose = (): void => {
    renderVersion += 1
    cancelActiveExport()
    backend.value.destroy?.()
    renderState.value = 'idle'
  }

  const viewport = ref<Size>({ width: 0, height: 0 })
  const view = ref<ViewState>(createView())
  const gridVisible = ref(true)
  const gridSpacing = ref(20)
  const gridMajorSpacing = ref(100)
  const rulersVisible = ref(true)
  const snapTolerance = ref(6)
  const snapEnabled = ref(true)
  const snapTemporarilyOff = ref(false)
  const snapGuides = ref(true)
  const snapEdges = ref(true)
  const snapCenters = ref(true)
  const snapPoints = ref(true)
  const guides = ref<Guide[]>([])
  const marqueeRect = ref<Rect | null>(null)
  const marqueeMode = ref<MarqueeMode>('inside')
  const handTool = ref(false)
  const fullscreen = ref(false)
  const cursorDocumentPoint = ref<Point | null>(null)
  let savedFullscreenView: ViewState = createView()

  const documentBounds = computed<Bounds | null>(() => {
    if (!scene.value) {
      return null
    }
    return sceneBounds(collectSceneObjects(scene.value))
  })

  const selectionObjects = computed<SceneObject[]>(() => {
    if (!scene.value) {
      return []
    }
    return findObjectsById(scene.value, selectedObjectIds.value)
  })

  const selectionBounds = computed<Bounds | null>(() => {
    const objects = selectionObjects.value
    return objects.length > 0 ? sceneBounds(objects) : null
  })

  const snapSettings = computed<SnapSettings>(() => ({
    enabled: snapEnabled.value && !snapTemporarilyOff.value,
    grid: gridVisible.value,
    guides: snapGuides.value && guides.value.length > 0,
    edges: snapEdges.value,
    centers: snapCenters.value,
    points: snapPoints.value,
    tolerance: snapTolerance.value,
  }))

  const buildSnapCandidates = (visible: Rect): SnapCandidates => {
    const gridX = gridVisible.value ? gridLines(visible.x, visible.x + visible.width, gridSpacing.value) : []
    const gridY = gridVisible.value ? gridLines(visible.y, visible.y + visible.height, gridSpacing.value) : []
    const edgeX: number[] = []
    const edgeY: number[] = []
    const centerX: number[] = []
    const centerY: number[] = []
    if (snapEdges.value || snapCenters.value) {
      const sources = scene.value ? [...collectSceneObjects(scene.value), ...selectionObjects.value] : selectionObjects.value
      const merged = candidatesForBounds(sources)
      edgeX.push(...merged.edgeX)
      edgeY.push(...merged.edgeY)
      centerX.push(...merged.centerX)
      centerY.push(...merged.centerY)
    }
    const guideCandidates = snapGuides.value ? guidesToCandidates(guides.value) : { guideX: [], guideY: [] }
    return { gridX, gridY, edgeX, edgeY, centerX, centerY, guideX: guideCandidates.guideX, guideY: guideCandidates.guideY }
  }

  const setViewport = (size: Size): void => {
    viewport.value = size
  }

  const setView = (next: ViewState): void => {
    view.value = next
  }

  const zoomAtPoint = (screen: Point, factor: number): void => {
    view.value = zoomAt(view.value, screen, factor)
  }

  const zoomInAt = (screen: Point): void => {
    view.value = zoomIn(view.value, screen)
  }

  const zoomOutAt = (screen: Point): void => {
    view.value = zoomOut(view.value, screen)
  }

  const panCanvas = (deltaX: number, deltaY: number): void => {
    view.value = panBy(view.value, deltaX, deltaY)
  }

  const fitToScreen = (): void => {
    const bounds = documentBounds.value
    if (!bounds || viewport.value.width === 0) {
      return
    }
    view.value = fitView(bounds, viewport.value)
  }

  const fitToSelection = (): void => {
    const bounds = selectionBounds.value
    if (!bounds || viewport.value.width === 0) {
      return
    }
    view.value = fitView(bounds, viewport.value)
  }

  const showActualSize = (): void => {
    const bounds = documentBounds.value
    if (!bounds) {
      return
    }
    view.value = actualSize(viewport.value, documentSizeOf(bounds))
  }

  const toggleGrid = (): void => {
    gridVisible.value = !gridVisible.value
  }

  const setGridSpacing = (spacing: number): void => {
    const value = Math.min(500, Math.max(1, spacing))
    gridSpacing.value = value
    gridMajorSpacing.value = value * 5
  }

  const toggleRulers = (): void => {
    rulersVisible.value = !rulersVisible.value
  }

  const toggleSnap = (): void => {
    snapEnabled.value = !snapEnabled.value
  }

  const setSnapTemporarilyOff = (value: boolean): void => {
    snapTemporarilyOff.value = value
  }

  const setSnapSettings = (settings: SnapSettings): void => {
    snapEnabled.value = settings.enabled
    snapGuides.value = settings.guides
    snapEdges.value = settings.edges
    snapCenters.value = settings.centers
    snapPoints.value = settings.points
  }

  const setSnapTolerance = (value: number): void => {
    snapTolerance.value = Math.min(40, Math.max(1, value))
  }

  const toggleHandTool = (): void => {
    handTool.value = !handTool.value
  }

  const addGuide = (orientation: GuideOrientation, position: number): Guide => {
    const guide = createGuide(orientation, position, nextGuideId(guides.value, orientation))
    guides.value = [...guides.value, guide]
    return guide
  }

  const updateGuide = (id: string, position: number): void => {
    guides.value = guides.value.map((guide) => (guide.id === id ? moveGuide(guide, position) : guide))
  }

  const removeGuide = (id: string): void => {
    guides.value = guides.value.filter((guide) => guide.id !== id)
  }

  const clearGuides = (): void => {
    guides.value = []
  }

  const setMarquee = (rect: Rect | null): void => {
    marqueeRect.value = rect
  }

  const setMarqueeMode = (mode: MarqueeMode): void => {
    marqueeMode.value = mode
  }

  const setCursorDocumentPoint = (point: Point | null): void => {
    cursorDocumentPoint.value = point
  }

  const toggleFullscreen = (): void => {
    if (fullscreen.value) {
      return
    }
    savedFullscreenView = view.value
    fullscreen.value = true
    const bounds = documentBounds.value
    if (bounds && viewport.value.width > 0) {
      view.value = fitView(bounds, viewport.value)
    }
  }

  const exitFullscreen = (): void => {
    if (!fullscreen.value) {
      return
    }
    fullscreen.value = false
    view.value = savedFullscreenView
  }

  const selectObjectAt = (point: Point, additive: boolean, includeHidden = false): void => {
    if (!scene.value) {
      return
    }
    selectedObjectIds.value = selectAt(collectSceneObjects(scene.value), point, additive, selectedObjectIds.value, includeHidden)
  }

  const marqueeSelectObjects = (rect: Rect, includeHidden = false): void => {
    if (!scene.value) {
      return
    }
    selectedObjectIds.value = selectByMarquee(
      collectSceneObjects(scene.value),
      rect,
      marqueeMode.value,
      includeHidden,
    )
  }

  const toggleObjectAt = (point: Point, includeHidden = false): void => {
    if (!scene.value) {
      return
    }
    const hit = hitTestScene(collectSceneObjects(scene.value), point, includeHidden)
    if (!hit) {
      return
    }
    selectedObjectIds.value = toggleInSelection(selectedObjectIds.value, hit.id)
  }

  const findParentMatrix = (objects: SceneObject[], targetId: string, parent: AffineMatrix): AffineMatrix | null => {
    for (const object of objects) {
      if (object.id === targetId) {
        return parent
      }
      if (object.type === 'group') {
        const nested = findParentMatrix(object.children, targetId, multiplyMatrix(parent, matrixFromTransform(object.transform)))
        if (nested) {
          return nested
        }
      }
    }
    return null
  }

  const parentMatrixFor = (object: SceneObject): AffineMatrix => {
    if (!scene.value) {
      return identityMatrix()
    }
    return findParentMatrix(scene.value.objects, object.id, identityMatrix()) ?? identityMatrix()
  }

  const collectPlacementPatches = (
    objects: readonly SceneObject[],
    placements: readonly ObjectPlacement[],
    getParentMatrix: ParentMatrixResolver,
  ): Map<string, Record<string, unknown>> => {
    const patches = new Map<string, Record<string, unknown>>()
    const setProperty: ScenePropertySetter = (object, key, value) => {
      const patch = patches.get(object.id) ?? {}
      patch[key as string] = value
      patches.set(object.id, patch)
    }
    applyPlacements(objects, placements, setProperty, getParentMatrix)
    return patches
  }

  const applySelectionPlacements = (
    placements: readonly ObjectPlacement[],
    options: { matchWidth?: boolean; matchHeight?: boolean },
  ): boolean => {
    if (placements.length === 0) {
      return false
    }
    const objects = selectionObjects.value
    const getParentMatrix: ParentMatrixResolver = (object) => parentMatrixFor(object)
    const patches = collectPlacementPatches(objects, placements, getParentMatrix)
    if (options.matchWidth || options.matchHeight) {
      const setProperty: ScenePropertySetter = (object, key, value) => {
        const patch = patches.get(object.id) ?? {}
        patch[key as string] = value
        patches.set(object.id, patch)
      }
      applySizeMatch(objects, options.matchWidth === true, options.matchHeight === true, setProperty, getParentMatrix)
    }
    beginInspectorEdit()
    const applied = applyObjectPatch(
      objects.map((object) => object.id),
      (object) => patches.get(object.id) ?? {},
    )
    if (applied) {
      commitInspectorEdit()
    } else {
      cancelInspectorEdit()
    }
    return applied
  }

  const alignSelection = (
    edge: AlignEdge,
    relative: 'selection' | 'document' | 'key',
    options: { matchWidth?: boolean; matchHeight?: boolean } = {},
  ): boolean => {
    const objects = selectionObjects.value
    if (objects.length < 2) {
      return false
    }
    const alignOptions: AlignOptions = { documentBounds: documentBounds.value }
    if (options.matchWidth) {
      alignOptions.matchWidth = true
    }
    if (options.matchHeight) {
      alignOptions.matchHeight = true
    }
    const placements = computeAlignment(objects, edge, relative, alignOptions)
    return applySelectionPlacements(placements, options)
  }

  const distributeSelection = (axis: DistributeAxis): boolean => {
    const objects = selectionObjects.value
    if (objects.length < 3) {
      return false
    }
    const placements = computeDistribution(objects, axis)
    return applySelectionPlacements(placements, {})
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
    isStale,
    errors,
    warnings,
    hasErrors,
    valid,
    exporting,
    objectCount,
    sceneCatalog,
    editorBackdrop,
    selectedObjectIds,
    inspectorLockAspect,
    canUndo,
    canRedo,
    targetKind,
    selectedGroupId,
    selectedLayerId,
    selectedSingleObjectId,
    selectedWorkspaceId,
    useCustomWorkspaceRegion,
    customRegion,
    exportFormat,
    exportScale,
    scaleMode,
    customWidth,
    customHeight,
    lockAspectRatio,
    fitMode,
    backgroundMode,
    customBackgroundColor,
    jpegQuality,
    bmpBitDepth,
    margin,
    trimToBounds,
    clipToBounds,
    includeHidden,
    minifySvg,
    filenameTemplate,
    batchMode,
    batchScopeKind,
    batchSelectedIds,
    batchOverrides,
    batchFilenameTemplate,
    packageAsZip,
    batchCandidatePool,
    exportPreview,
    lastExportResult,
    batchItemsState,
    batchProgressCompleted,
    batchProgressTotal,
    lastBatchReport,
    exportMessage,
    exportError,
    activeTarget,
    activeBackground,
    effectiveDimensions,
    outputWidth,
    outputHeight,
    outputValid,
    canExport,
    activeExportOptions,
    preflightValidation,
    resolvedFilenamePreview,
    initialize,
    render,
    refreshExportPreview,
    setSource,
    formatSource,
    reset,
    setFormat,
    setPresetScale,
    enableCustomScale,
    setCustomWidth,
    setCustomHeight,
    resetDimensions,
    toggleObjectInSelection,
    beginInspectorEdit,
    commitInspectorEdit,
    cancelInspectorEdit,
    undo,
    redo,
    applyObjectPatch,
    pathTool,
    nodeEditing,
    pathNotice,
    selectedSubpath,
    selectedNode,
    setSelectedNode,
    appendSceneObject,
    createSceneObject,
    removeSceneObject,
    setSelectedObjectIds,
    viewport,
    view,
    gridVisible,
    gridSpacing,
    gridMajorSpacing,
    rulersVisible,
    snapSettings,
    snapEnabled,
    snapTemporarilyOff,
    snapGuides,
    snapEdges,
    snapCenters,
    snapPoints,
    snapTolerance,
    guides,
    marqueeRect,
    marqueeMode,
    handTool,
    fullscreen,
    cursorDocumentPoint,
    documentBounds,
    selectionObjects,
    selectionBounds,
    buildSnapCandidates,
    setViewport,
    setView,
    zoomAtPoint,
    zoomInAt,
    zoomOutAt,
    panCanvas,
    fitToScreen,
    fitToSelection,
    showActualSize,
    toggleGrid,
    setGridSpacing,
    toggleRulers,
    toggleSnap,
    setSnapTemporarilyOff,
    setSnapSettings,
    setSnapTolerance,
    toggleHandTool,
    addGuide,
    updateGuide,
    removeGuide,
    clearGuides,
    setMarquee,
    setMarqueeMode,
    setCursorDocumentPoint,
    toggleFullscreen,
    exitFullscreen,
    selectObjectAt,
    marqueeSelectObjects,
    toggleObjectAt,
    alignSelection,
    distributeSelection,
    setPathTool,
    setNodeEditing,
    setPathNotice,
    applyPathCommandToSelection,
    addPathFromModel,
    applyBooleanToSelection,
    selectInspectorObject,
    toggleInspectorVisibility,
    setInspectorLockAspect,
    toggleBatchCandidate,
    setBatchOverride,
    cancelActiveExport,
    exportCurrent,
    exportBatch,
    downloadBatchItem,
    downloadBatchZip,
    dispose,
  }
})
