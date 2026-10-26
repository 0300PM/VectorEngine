import { beforeEach, describe, expect, it } from 'vitest'
import {
  SECTIONS_STORAGE_KEY,
  collapseAllSections,
  expandAllSections,
  isSectionCollapsed,
  resetSections,
  setSectionCollapsed,
  toggleSection,
  useCollapsibleSection,
} from './useCollapsibleSection'

describe('collapsible sections', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSections()
  })

  it('opens sections by default', () => {
    expect(isSectionCollapsed('inspector.transform')).toBe(false)
    expect(useCollapsibleSection('inspector.transform').collapsed.value).toBe(false)
  })

  it('honours an explicit default state', () => {
    expect(useCollapsibleSection('export.advanced', false).collapsed.value).toBe(true)
  })

  it('toggles and persists the state', () => {
    toggleSection('export.format')
    expect(isSectionCollapsed('export.format')).toBe(true)
    expect(JSON.parse(localStorage.getItem(SECTIONS_STORAGE_KEY) ?? '{}')).toEqual({ 'export.format': true })

    toggleSection('export.format')
    expect(isSectionCollapsed('export.format')).toBe(false)
  })

  it('keeps ids independent', () => {
    setSectionCollapsed('inspector.shape', true)
    expect(isSectionCollapsed('inspector.shape')).toBe(true)
    expect(isSectionCollapsed('inspector.transform')).toBe(false)
  })

  it('restores stored state when a section is re-read', () => {
    setSectionCollapsed('export.target', true)
    expect(useCollapsibleSection('export.target').collapsed.value).toBe(true)
    expandAllSections(['export.target'])
    expect(useCollapsibleSection('export.target').collapsed.value).toBe(false)
  })

  it('collapses and expands groups of sections', () => {
    collapseAllSections(['a', 'b'])
    expect([isSectionCollapsed('a'), isSectionCollapsed('b')]).toEqual([true, true])

    expandAllSections(['a'])
    expect([isSectionCollapsed('a'), isSectionCollapsed('b')]).toEqual([false, true])
  })

  it('clears every stored section', () => {
    setSectionCollapsed('a', true)
    resetSections()
    expect(isSectionCollapsed('a')).toBe(false)
  })

  it('exposes imperative controls', () => {
    const section = useCollapsibleSection('manual')
    section.collapse()
    expect(section.collapsed.value).toBe(true)
    section.toggle()
    expect(section.collapsed.value).toBe(false)
    section.expand()
    expect(section.collapsed.value).toBe(false)
  })
})
