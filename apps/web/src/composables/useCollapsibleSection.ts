import { computed, ref, type ComputedRef } from 'vue'

/**
 * Shared, persisted collapse state for the accordion sections inside the
 * workspace panels (inspector groups, export steps). Panel-level collapse lives
 * in the engine store because it changes the workspace grid; these sections are
 * purely presentational, so a tiny reactive map is enough.
 */

export const SECTIONS_STORAGE_KEY = 'vector-engine.sections'

type SectionState = Record<string, boolean>

const collapsedSections = ref<SectionState>({})
let hydrated = false

const readStorage = (): SectionState => {
  if (typeof localStorage === 'undefined') {
    return {}
  }
  try {
    const raw = localStorage.getItem(SECTIONS_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    const next: SectionState = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') {
        next[key] = value
      }
    }
    return next
  } catch {
    return {}
  }
}

const hydrate = (): void => {
  if (hydrated) {
    return
  }
  hydrated = true
  collapsedSections.value = readStorage()
}

const persist = (): void => {
  if (typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(collapsedSections.value))
  } catch {
    return
  }
}

export const isSectionCollapsed = (id: string): boolean => {
  hydrate()
  return collapsedSections.value[id] === true
}

export const setSectionCollapsed = (id: string, collapsed: boolean): void => {
  hydrate()
  if (isSectionCollapsed(id) === collapsed) {
    return
  }
  collapsedSections.value = { ...collapsedSections.value, [id]: collapsed }
  persist()
}

export const toggleSection = (id: string): void => {
  setSectionCollapsed(id, !isSectionCollapsed(id))
}

export const resetSections = (): void => {
  hydrate()
  collapsedSections.value = {}
  persist()
}

export const collapseAllSections = (ids: readonly string[]): void => {
  hydrate()
  const next = { ...collapsedSections.value }
  for (const id of ids) {
    next[id] = true
  }
  collapsedSections.value = next
  persist()
}

export const expandAllSections = (ids: readonly string[]): void => {
  hydrate()
  const next = { ...collapsedSections.value }
  for (const id of ids) {
    next[id] = false
  }
  collapsedSections.value = next
  persist()
}

export interface SectionControls {
  collapsed: ComputedRef<boolean>
  toggle: () => void
  expand: () => void
  collapse: () => void
}

/**
 * Section state bound to a stable id. Sections are open by default; a stored
 * value always wins so the layout survives reloads.
 */
export const useCollapsibleSection = (id: string, defaultOpen = true): SectionControls => {
  hydrate()
  const collapsed = computed<boolean>(() => {
    const stored = collapsedSections.value[id]
    return stored === undefined ? !defaultOpen : stored
  })
  return {
    collapsed,
    toggle: () => setSectionCollapsed(id, !collapsed.value),
    expand: () => setSectionCollapsed(id, false),
    collapse: () => setSectionCollapsed(id, true),
  }
}
