import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * Reactive `matchMedia` wrapper. Resolves to `false` during SSR and in test
 * environments without `window.matchMedia`, so callers never need a guard.
 */
export const useMediaQuery = (query: string): Readonly<Ref<boolean>> => {
  const matches = ref(false)
  let list: MediaQueryList | null = null

  const update = (event: MediaQueryList | MediaQueryListEvent): void => {
    matches.value = event.matches
  }

  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    list = window.matchMedia(query)
    matches.value = list.matches
    list.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    list?.removeEventListener('change', update)
    list = null
  })

  return matches
}
