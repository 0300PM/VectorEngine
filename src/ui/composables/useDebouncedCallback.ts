import { onScopeDispose } from 'vue'

export const useDebouncedCallback = <Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
) => {
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const run = (...args: Args): void => {
    cancel()
    timer = setTimeout(() => {
      timer = undefined
      callback(...args)
    }, delayMs)
  }

  onScopeDispose(cancel)

  return { run, cancel }
}
