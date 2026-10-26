<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import UiIcon from './UiIcon.vue'
import { findObjectsById } from '@/inspector/sceneTree'
import { BOOLEAN_LABELS, type BooleanOperation } from '@/paths/boolean'
import { parsePathObject, type PathCommand } from '@/paths/editor'
import { totalNodeCount, type HandleMode } from '@/paths/model'
import { PATH_TOOLS, type PathToolKind } from '@/paths/tools'
import { useEngineStore } from '@/stores/engine'
import type { IconName } from '@/ui/icons'
import type { PathObject } from '@/types/scene'

const store = useEngineStore()
const {
  pathTool,
  nodeEditing,
  pathNotice,
  scene,
  selectedObjectIds,
  selectedSubpath,
  selectedNode,
} = storeToRefs(store)

const simplifyTolerance = ref(2)

const BOOLEAN_ACTIONS: { operation: BooleanOperation; icon: IconName }[] = [
  { operation: 'union', icon: 'union' },
  { operation: 'subtract', icon: 'subtract' },
  { operation: 'intersect', icon: 'intersect' },
  { operation: 'exclude', icon: 'exclude' },
]

const selectedPaths = computed<PathObject[]>(() => {
  if (!scene.value) {
    return []
  }
  return findObjectsById(scene.value, selectedObjectIds.value).filter(
    (object): object is PathObject => object.type === 'path',
  )
})

const primaryModel = computed(() => {
  const first = selectedPaths.value[0]
  return first ? parsePathObject(first) : null
})

const subpathCount = computed(() => primaryModel.value?.subpaths.length ?? 0)
const nodeCount = computed(() => (primaryModel.value ? totalNodeCount(primaryModel.value) : 0))
const closedCount = computed(
  () => primaryModel.value?.subpaths.filter((subpath) => subpath.closed).length ?? 0,
)

const hasExactlyOnePath = computed(() => selectedPaths.value.length === 1)
const hasTwoPaths = computed(() => selectedPaths.value.length === 2)

const editingReason = computed(() => {
  if (selectedPaths.value.length === 0) {
    return 'Select a path to edit its nodes'
  }
  if (!hasExactlyOnePath.value) {
    return 'Node editing requires exactly one path'
  }
  if (subpathCount.value === 0) {
    return 'The path has no subpaths'
  }
  return ''
})

const joinReason = computed(() => {
  if (!hasExactlyOnePath.value) {
    return 'Select a single path'
  }
  if (subpathCount.value < 2) {
    return 'The path needs at least two subpaths to join'
  }
  return ''
})

const splitReason = computed(() => {
  if (!hasExactlyOnePath.value) {
    return 'Select a single path'
  }
  const first = primaryModel.value?.subpaths[0]
  if (!first || first.nodes.length < 3) {
    return 'A subpath needs at least 3 nodes'
  }
  return ''
})

const booleanReason = computed(() => {
  if (selectedPaths.value.length < 2) {
    return 'Select two paths'
  }
  if (selectedPaths.value.some((object) => !parsePathObject(object)?.subpaths.some((subpath) => subpath.closed))) {
    return 'Closed shapes are required'
  }
  return ''
})

const selectTool = (kind: PathToolKind): void => {
  store.setPathTool(kind)
  if (kind === 'select') {
    store.setNodeEditing(true)
  }
}

const toggleEditing = (): void => {
  if (!nodeEditing.value && editingReason.value) {
    return
  }
  store.setNodeEditing(!nodeEditing.value)
}

const runCommand = (command: PathCommand): void => {
  const applied = store.applyPathCommandToSelection(command)
  if (!applied) {
    store.setPathNotice('The operation was not applied')
  }
}

const toggleClosed = (): void => {
  const subpath = primaryModel.value?.subpaths[0]
  if (!subpath) {
    return
  }
  runCommand({ kind: 'toggle-closed', subpath: 0 })
}

const splitSubpath = (): void => {
  const subpath = primaryModel.value?.subpaths[0]
  if (!subpath || subpath.nodes.length < 3) {
    return
  }
  runCommand({ kind: 'split-subpath', subpath: 0, node: Math.floor(subpath.nodes.length / 2) })
}

const simplify = (): void => {
  runCommand({ kind: 'simplify', tolerance: simplifyTolerance.value })
}

const selectedSubpathModel = computed(() => primaryModel.value?.subpaths[selectedSubpath.value])
const hasSelectedNode = computed(() => Boolean(selectedSubpathModel.value?.nodes[selectedNode.value]))
const nodeMode = computed<HandleMode>(
  () => selectedSubpathModel.value?.nodes[selectedNode.value]?.mode ?? 'corner',
)

const setNodeHandleMode = (mode: HandleMode): void => {
  runCommand({ kind: 'set-mode', subpath: selectedSubpath.value, node: selectedNode.value, mode })
}

const deleteSelectedNode = (): void => {
  runCommand({ kind: 'delete-node', subpath: selectedSubpath.value, node: selectedNode.value })
}

const runBoolean = (operation: BooleanOperation): void => {
  store.applyBooleanToSelection(operation)
}

const removeSelected = (): void => {
  for (const object of selectedPaths.value) {
    store.removeSceneObject(object.id)
  }
}
</script>

<template>
  <div class="path-toolbar" role="toolbar" aria-label="Vector path tools">
    <div class="path-toolbar-group">
      <button
        v-for="tool in PATH_TOOLS"
        :key="tool.kind"
        type="button"
        class="path-tool-button"
        :class="{ active: pathTool === tool.kind }"
        :title="tool.hint"
        :aria-pressed="pathTool === tool.kind"
        @click="selectTool(tool.kind)"
      >
        <UiIcon :name="tool.icon" :size="15" />
        <span>{{ tool.label }}</span>
      </button>
    </div>

    <span class="control-divider" />

    <div class="path-toolbar-group">
      <button
        type="button"
        class="path-tool-button"
        :class="{ active: nodeEditing }"
        :title="nodeEditing ? 'Disable node editing' : editingReason || 'Enable node editing'"
        @click="toggleEditing"
      >
        <UiIcon name="nodes" :size="15" />
        <span>Nodes</span>
      </button>
      <button
        type="button"
        class="path-tool-button"
        :disabled="!hasExactlyOnePath || subpathCount < 2"
        :title="joinReason || 'Join subpaths'"
        @click="runCommand({ kind: 'join', first: 0, second: 1 })"
      >
        <UiIcon name="link" :size="15" />
        <span>Join</span>
      </button>
      <button
        type="button"
        class="path-tool-button"
        :disabled="!hasExactlyOnePath || subpathCount < 2"
        :title="splitReason || 'Split subpaths'"
        @click="splitSubpath"
      >
        <UiIcon name="unlink" :size="15" />
        <span>Split</span>
      </button>
      <button
        type="button"
        class="path-tool-button"
        :disabled="!hasExactlyOnePath || nodeCount < 2"
        title="Reverse path direction"
        @click="runCommand({ kind: 'reverse', subpath: 0 })"
      >
        <UiIcon name="reverse" :size="15" />
        <span>Reverse</span>
      </button>
      <button
        type="button"
        class="path-tool-button"
        :disabled="!hasExactlyOnePath || subpathCount < 1"
        :title="closedCount > 0 ? 'Open subpath' : 'Close subpath'"
        @click="toggleClosed"
      >
        <UiIcon :name="closedCount > 0 ? 'unlock' : 'lock'" :size="15" />
        <span>{{ closedCount > 0 ? 'Open' : 'Close' }}</span>
      </button>
      <button
        type="button"
        class="path-tool-button"
        :disabled="!hasExactlyOnePath || nodeCount < 3"
        title="Simplify geometry"
        @click="simplify"
      >
        <UiIcon name="simplify" :size="15" />
        <span>Simplify</span>
      </button>
      <label class="tolerance-field" :class="{ disabled: !hasExactlyOnePath }">
        <span>Tolerance</span>
        <input v-model.number="simplifyTolerance" type="range" min="0" max="40" step="0.5" :disabled="!hasExactlyOnePath" />
        <output>{{ simplifyTolerance }}</output>
      </label>
    </div>

    <span class="control-divider" />

    <div class="path-toolbar-group">
      <button
        type="button"
        class="path-tool-button"
        :class="{ active: nodeMode === 'corner' }"
        :disabled="!hasSelectedNode"
        title="Corner node"
        @click="setNodeHandleMode('corner')"
      >
        <UiIcon name="corner" :size="15" />
        <span>Corner</span>
      </button>
      <button
        type="button"
        class="path-tool-button"
        :class="{ active: nodeMode === 'smooth' }"
        :disabled="!hasSelectedNode"
        title="Smooth node"
        @click="setNodeHandleMode('smooth')"
      >
        <UiIcon name="smooth" :size="15" />
        <span>Smooth</span>
      </button>
      <button
        type="button"
        class="path-tool-button"
        :class="{ active: nodeMode === 'symmetric' }"
        :disabled="!hasSelectedNode"
        title="Symmetric node"
        @click="setNodeHandleMode('symmetric')"
      >
        <UiIcon name="symmetric" :size="15" />
        <span>Sym.</span>
      </button>
      <button
        type="button"
        class="path-tool-button"
        :disabled="!hasSelectedNode"
        title="Delete selected node"
        @click="deleteSelectedNode"
      >
        <UiIcon name="minus" :size="15" />
        <span>Delete node</span>
      </button>
    </div>

    <span class="control-divider" />

    <div class="path-toolbar-group">
      <button
        v-for="action in BOOLEAN_ACTIONS"
        :key="action.operation"
        type="button"
        class="path-tool-button boolean"
        :disabled="!hasTwoPaths || booleanReason !== ''"
        :title="booleanReason || `${BOOLEAN_LABELS[action.operation]} paths`"
        @click="runBoolean(action.operation)"
      >
        <UiIcon :name="action.icon" :size="15" />
        <span>{{ BOOLEAN_LABELS[action.operation] }}</span>
      </button>
    </div>

    <span class="control-divider" />

    <div class="path-toolbar-group">
      <button
        type="button"
        class="path-tool-button danger"
        :disabled="selectedPaths.length === 0"
        title="Delete selected paths"
        @click="removeSelected"
      >
        <UiIcon name="close" :size="15" />
        <span>Delete</span>
      </button>
    </div>

    <p class="path-toolbar-status" role="status">
      <template v-if="pathNotice">{{ pathNotice }}</template>
      <template v-else-if="hasExactlyOnePath">
        {{ subpathCount }} subpaths · {{ nodeCount }} nodes · {{ closedCount }} closed
      </template>
      <template v-else-if="selectedPaths.length > 1">{{ selectedPaths.length }} paths selected</template>
      <template v-else>Vector path tools</template>
    </p>
  </div>
</template>
