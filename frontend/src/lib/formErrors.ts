import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '../api/types'

/** Field messages from a validation error: details.fields = { email: "Invalid email" }. */
export function serverFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.details) return {}
  const fields = (error.details as { fields?: unknown }).fields
  if (typeof fields !== 'object' || fields === null) return {}
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

/** Show server field errors on the matching inputs. Returns true if any field was marked. */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  formFields: readonly Path<T>[],
): boolean {
  const messages = serverFieldErrors(error)
  let applied = false
  for (const field of formFields) {
    const message = messages[field]
    if (message) {
      setError(field, { type: 'server', message })
      applied = true
    }
  }
  return applied
}
