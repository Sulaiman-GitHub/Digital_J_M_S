import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../../api/auth'
import { ApiError, type User } from '../../api/types'

export const ME_KEY = ['auth', 'me'] as const

/** The signed-in user, or null when there is no session. A 401 means "not logged in", not an error. */
export function useCurrentUser() {
  return useQuery<User | null>({
    queryKey: ME_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await fetchMe(signal)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 60_000,
  })
}
