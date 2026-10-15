import { z } from 'zod'
import type { Locale } from '@/i18n'

const zodLocales: Readonly<Record<Locale, () => z.core.$ZodConfig>> = {
  en: z.locales.en,
  pl: z.locales.pl,
}

export const applyValidationLocale = (locale: Locale): void => {
  z.config(zodLocales[locale]())
}
