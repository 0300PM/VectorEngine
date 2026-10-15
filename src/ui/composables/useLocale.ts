import { watch } from 'vue'
import { applyValidationLocale } from '@/app/services/validationLocale'
import { useDocumentStore } from '@/app/stores'
import { LOCALE_STORAGE_KEY, locales, useMessages, type Locale } from '@/i18n'

export const useLocale = () => {
  const { locale } = useMessages()
  const documentStore = useDocumentStore()

  const setLocale = (next: Locale): void => {
    locale.value = next
  }

  watch(locale, (next) => {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, next)
    document.documentElement.lang = next
    applyValidationLocale(next)
    if (!documentStore.isValid) {
      documentStore.validateSource()
    }
  })

  return { locale, locales, setLocale }
}
