<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import type { RenderState, ValidationIssue } from '@/types/engine'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  modelValue: string
  issues: ValidationIssue[]
  renderState: RenderState
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  format: []
  collapse: []
}>()

const editorHost = ref<HTMLDivElement | null>(null)
let editor: EditorView | null = null
let applyingExternalValue = false

const stateLabel = computed(() => {
  if (props.renderState === 'validating') return 'Validating'
  if (props.renderState === 'rendering') return 'Rendering'
  if (props.renderState === 'error') return 'Invalid JSON'
  if (props.renderState === 'initializing') return 'Starting engine'
  return 'Live input'
})

const errorCount = computed(() => props.issues.filter((issue) => issue.severity === 'error').length)
const visibleIssues = computed(() => props.issues.slice(0, 4))

const issueOffset = (issue: ValidationIssue): number => {
  if (issue.offset !== undefined) {
    return Math.min(issue.offset, props.modelValue.length)
  }
  const segments = issue.path.split('/').filter(Boolean)
  const property = segments.at(-1)
  if (property && !/^\d+$/.test(property)) {
    const index = props.modelValue.indexOf(`"${property}"`)
    if (index >= 0) {
      return index
    }
  }
  return 0
}

const diagnostics = (): Diagnostic[] => props.issues.map((issue) => {
  const from = issueOffset(issue)
  return {
    from,
    to: Math.min(from + 1, props.modelValue.length),
    severity: issue.severity,
    message: `${issue.path}: ${issue.message}`,
  }
})

const applyDiagnostics = (): void => {
  if (!editor) {
    return
  }
  editor.dispatch(setDiagnostics(editor.state, diagnostics()))
}

const goToIssue = (issue: ValidationIssue): void => {
  if (!editor) {
    return
  }
  const offset = issueOffset(issue)
  editor.dispatch({
    selection: { anchor: offset },
    effects: EditorView.scrollIntoView(offset, { y: 'center' }),
  })
  editor.focus()
}

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#ffffff',
    color: '#202124',
    fontSize: '12.5px',
  },
  '.cm-content': {
    padding: '14px 0 48px',
    caretColor: '#0052FF',
    fontFamily: 'IBM Plex Mono, SFMono-Regular, Consolas, monospace',
    lineHeight: '1.65',
  },
  '.cm-line': {
    padding: '0 18px 0 10px',
  },
  '.cm-gutters': {
    backgroundColor: '#FAFAFA',
    color: '#A3A3A3',
    borderRight: '1px solid #EEEEEE',
    fontFamily: 'IBM Plex Mono, SFMono-Regular, Consolas, monospace',
    fontSize: '11px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#EEF3FF',
    color: '#0052FF',
  },
  '.cm-activeLine': {
    backgroundColor: '#F8FAFF',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: '#DCE7FF',
  },
  '.cm-cursor': {
    borderLeftColor: '#0052FF',
  },
  '.cm-foldGutter': {
    width: '12px',
  },
  '.cm-tooltip': {
    border: '1px solid #E5E5E5',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(23, 23, 23, 0.08)',
  },
}, { dark: false })

onMounted(() => {
  if (!editorHost.value) {
    return
  }

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      json(),
      indentUnit.of('  '),
      lintGutter(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      editorTheme,
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
        {
          key: 'Mod-Shift-f',
          run: () => {
            emit('format')
            return true
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternalValue) {
          emit('update:modelValue', update.state.doc.toString())
        }
      }),
    ],
  })

  editor = new EditorView({ state, parent: editorHost.value })
  applyDiagnostics()
})

watch(() => props.modelValue, async (value) => {
  if (!editor || editor.state.doc.toString() === value) {
    return
  }
  applyingExternalValue = true
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  await nextTick()
  applyingExternalValue = false
})

watch(() => props.issues, applyDiagnostics, { deep: true })

onBeforeUnmount(() => {
  editor?.destroy()
  editor = null
})
</script>

<template>
  <section class="workspace-panel editor-panel" aria-label="JSON editor">
    <header class="panel-heading">
      <div>
        <div class="panel-eyebrow">SOURCE</div>
        <h2 class="panel-title">Scene JSON</h2>
      </div>
      <div class="panel-heading-actions">
        <span class="live-state" :class="{ error: errorCount > 0 }">
          <span class="live-dot" />
          {{ stateLabel }}
        </span>
        <button class="icon-text-button" type="button" title="Format JSON (Ctrl/⌘ + Shift + F)" @click="emit('format')">
          <UiIcon name="format" />
          Format
        </button>
        <button
          class="panel-collapse"
          type="button"
          title="Collapse panel"
          aria-label="Collapse Source panel"
          @click="emit('collapse')"
        >
          <UiIcon name="chevron" :size="13" />
        </button>
      </div>
    </header>

    <div ref="editorHost" class="editor-host" />

    <div v-if="visibleIssues.length" class="issues-drawer" :class="{ warnings: errorCount === 0 }">
      <button
        v-for="issue in visibleIssues"
        :key="`${issue.code}-${issue.path}-${issue.message}`"
        class="issue-row"
        type="button"
        @click="goToIssue(issue)"
      >
        <UiIcon :name="issue.severity === 'error' ? 'alert' : 'info'" :size="14" />
        <span class="issue-path">{{ issue.path }}</span>
        <span class="issue-message">{{ issue.message }}</span>
      </button>
      <div v-if="props.issues.length > visibleIssues.length" class="more-issues">
        +{{ props.issues.length - visibleIssues.length }} more issues
      </div>
    </div>
  </section>
</template>
