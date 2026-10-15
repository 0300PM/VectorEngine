const randomSuffix = (): string =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)

export const createId = (prefix: string): string => `${prefix}_${randomSuffix()}`
