import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ME_KEY } from './useCurrentUser'

/**
 * After an account is deleted the person is sent to the home page with `accountDeleted` in the
 * navigation state. Only once that page is showing do we forget the user: doing it earlier would
 * make the page they are leaving redirect to the login page first.
 */
export function ForgetDeletedSession() {
  const queryClient = useQueryClient()
  const location = useLocation()
  const deleted = (location.state as { accountDeleted?: boolean } | null)?.accountDeleted === true

  useEffect(() => {
    if (!deleted) return
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' })
    queryClient.setQueryData(ME_KEY, null)
  }, [deleted, queryClient])

  return null
}
