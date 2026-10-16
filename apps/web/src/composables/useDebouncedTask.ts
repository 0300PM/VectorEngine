import { onScopeDispose } from 'vue'

export const useDebouncedTask = (task: () => void | Promise<void>, delay: number) => {
  let timer: number | undefined

  const schedule = (): void => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void task(), delay)
  }

  const cancel = (): void => {
    window.clearTimeout(timer)
    timer = undefined
  }

  onScopeDispose(cancel)

  return { schedule, cancel }
}
