export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })

export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const mapResult = <T, U, E>(
  result: Result<T, E>,
  transform: (value: T) => U,
): Result<U, E> => (result.ok ? ok(transform(result.value)) : result)

export const andThen = <T, U, E>(
  result: Result<T, E>,
  next: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? next(result.value) : result)
