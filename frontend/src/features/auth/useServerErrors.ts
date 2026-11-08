import { useCallback, useState } from 'react'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '../../api/types'
import { useToast } from '../../components/toastContext'
import { applyFieldErrors } from '../../lib/formErrors'

/**
 * Where a failed request is shown:
 * - field errors from the server: under the matching input
 * - other expected errors (wrong password, rate limit, ...): alert above the form
 * - unexpected ones (server down, 5xx): toast
 * `fields` must be a stable array (define it outside the component).
 */
export function useServerErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
) {
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)

  const handleError = useCallback(
    (error: unknown) => {
      setFormError(null)
      if (!(error instanceof ApiError)) {
        toast.show({ message: 'Something went wrong. Please try again.', tone: 'error' })
        return
      }
      if (applyFieldErrors(error, setError, fields)) return
      if (error.status === 0 || error.status >= 500) {
        toast.show({ message: error.message, tone: 'error' })
        return
      }
      setFormError(error.message)
    },
    [fields, setError, toast],
  )

  return { formError, clearFormError: () => setFormError(null), handleError }
}
