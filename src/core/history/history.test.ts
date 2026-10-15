import { describe, expect, it } from 'vitest'
import { canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory } from './index'

describe('history', () => {
  it('tracks undo and redo stacks', () => {
    let history = createHistory('a')
    history = pushHistory(history, 'b')
    history = pushHistory(history, 'c')
    expect(canUndo(history)).toBe(true)
    expect(canRedo(history)).toBe(false)

    history = undoHistory(history)
    expect(history.present).toBe('b')
    expect(canRedo(history)).toBe(true)

    history = redoHistory(history)
    expect(history.present).toBe('c')
  })

  it('discards the redo stack after a new change', () => {
    let history = pushHistory(pushHistory(createHistory(1), 2), 3)
    history = undoHistory(history)
    history = pushHistory(history, 4)
    expect(history.future).toEqual([])
    expect(history.past).toEqual([1, 2])
  })

  it('respects the configured limit', () => {
    let history = createHistory(0, 2)
    for (let value = 1; value <= 5; value += 1) {
      history = pushHistory(history, value)
    }
    expect(history.past).toEqual([3, 4])
  })

  it('ignores identical states', () => {
    const history = createHistory('same')
    expect(pushHistory(history, 'same')).toBe(history)
  })
})
