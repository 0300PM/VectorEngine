export type History<T> = {
  readonly past: readonly T[]
  readonly present: T
  readonly future: readonly T[]
  readonly limit: number
}

export const DEFAULT_HISTORY_LIMIT = 100

export const createHistory = <T>(present: T, limit = DEFAULT_HISTORY_LIMIT): History<T> => ({
  past: [],
  present,
  future: [],
  limit,
})

export const canUndo = <T>(history: History<T>): boolean => history.past.length > 0

export const canRedo = <T>(history: History<T>): boolean => history.future.length > 0

export const pushHistory = <T>(history: History<T>, next: T): History<T> => {
  if (Object.is(next, history.present)) {
    return history
  }
  const past = [...history.past, history.present].slice(-history.limit)
  return { ...history, past, present: next, future: [] }
}

export const replacePresent = <T>(history: History<T>, present: T): History<T> => ({
  ...history,
  present,
})

export const undoHistory = <T>(history: History<T>): History<T> => {
  if (!canUndo(history)) {
    return history
  }
  const past = history.past.slice(0, -1)
  const present = history.past[history.past.length - 1] as T
  return { ...history, past, present, future: [history.present, ...history.future] }
}

export const redoHistory = <T>(history: History<T>): History<T> => {
  if (!canRedo(history)) {
    return history
  }
  const present = history.future[0] as T
  return {
    ...history,
    past: [...history.past, history.present],
    present,
    future: history.future.slice(1),
  }
}
