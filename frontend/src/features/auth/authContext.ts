import { createContext, useContext } from 'react'
import type { User } from '../../api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error'

export interface AuthState {
  user: User | null
  status: AuthStatus
  /** Re-check the session (used by the Retry button when the check itself failed). */
  refetch: () => void
  /** Ends the session on the server and clears private data. Rejects if the server was unreachable. */
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>')
  return state
}
