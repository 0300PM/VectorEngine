import { createI18n, useI18n } from 'vue-i18n'
import { en, type MessageSchema } from './messages/en'
import { pl } from './messages/pl'

export const locales = ['pl', 'en'] as const
export type Locale = (typeof locales)[number]

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_STORAGE_KEY = 'vector-engine.locale'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (locales as readonly string[]).includes(value)

const polishPluralRule = (choice: number, choicesLength: number): number => {
  if (choice === 0) {
    return 0
  }
  const lastDigit = choice % 10
  const teens = choice % 100 >= 12 && choice % 100 <= 14
  if (choice === 1) {
    return 1
  }
  if (lastDigit >= 2 && lastDigit <= 4 && !teens) {
    return Math.min(2, choicesLength - 1)
  }
  return Math.min(3, choicesLength - 1)
}

export const detectLocale = (
  storage: Pick<Storage, 'getItem'> | undefined,
  language: string | undefined,
): Locale => {
  const stored = storage?.getItem(LOCALE_STORAGE_KEY)
  if (isLocale(stored)) {
    return stored
  }
  return language?.toLowerCase().startsWith('pl') ? 'pl' : DEFAULT_LOCALE
}

export const createAppI18n = (locale: Locale) =>
  createI18n<[MessageSchema], Locale>({
    legacy: false,
    locale,
    fallbackLocale: DEFAULT_LOCALE,
    messages: { en, pl },
    pluralRules: { pl: polishPluralRule },
  })

export const useMessages = () => useI18n<{ message: MessageSchema }, Locale>()

type MessagePaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : MessagePaths<T[K], `${Prefix}${K}.`>
}[keyof T & string]

export type MessageKey = MessagePaths<MessageSchema>

export type { MessageSchema }
