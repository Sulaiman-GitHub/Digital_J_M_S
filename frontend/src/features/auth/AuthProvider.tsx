import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, type ReactNode } from 'react'
import { logoutUser } from '../../api/auth'
import { ApiError } from '../../api/types'
import { AuthContext, type AuthState, type AuthStatus } from './authContext'
import { ME_KEY, useCurrentUser } from './useCurrentUser'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const query = useCurrentUser()

  const logout = useCallback(async () => {
    try {
      await logoutUser()
    } catch (error) {
      // 401: the session was already gone, which is the state we wanted.
      if (!(error instanceof ApiError && error.status === 401)) throw error
    }
    // Forget everything except the (now empty) auth state so no private data lingers.
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' })
    queryClient.setQueryData(ME_KEY, null)
  }, [queryClient])

  const value = useMemo<AuthState>(() => {
    const status: AuthStatus = query.isPending
      ? 'loading'
      : query.isError
        ? 'error'
        : query.data
          ? 'authenticated'
          : 'unauthenticated'
    return {
      user: query.data ?? null,
      status,
      refetch: () => void query.refetch(),
      logout,
    }
  }, [query, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
