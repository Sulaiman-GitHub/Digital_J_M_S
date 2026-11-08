import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../../api/auth'
import { ApiError } from '../../api/types'
import { buttonClasses } from '../../components/buttonStyles'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { AuthShell } from './AuthShell'
import { useAuth } from './authContext'
import { ME_KEY } from './useCurrentUser'

const TOKEN_TITLES: Record<string, string> = {
  token_expired: 'This link has expired',
  token_used: 'This link was already used',
  token_invalid: 'This link is not valid',
}

const TOKEN_ERRORS_SET = new Set(Object.keys(TOKEN_TITLES))

function ResultIcon({ ok }: { ok: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`mx-auto grid size-14 place-items-center rounded-pill text-2xl ${
        ok ? 'bg-success-tint text-success' : 'bg-danger-tint text-danger'
      }`}
    >
      {ok ? '✓' : '!'}
    </div>
  )
}

/** Opened from the link in the verification email: /verify-email?token=... */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // A query (not an effect) so React StrictMode's double render sends the token only once.
  const result = useQuery({
    queryKey: ['auth', 'verify-email', token],
    queryFn: () => verifyEmail(token ?? ''),
    enabled: Boolean(token),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })

  useEffect(() => {
    if (result.isSuccess) void queryClient.invalidateQueries({ queryKey: ME_KEY })
  }, [result.isSuccess, queryClient])

  if (!token) {
    return (
      <Failure title={TOKEN_TITLES.token_invalid} message="Request a new link from your account." />
    )
  }

  if (result.isPending) {
    return (
      <AuthShell title="Confirming your email" centered>
        <div role="status" className="space-y-3">
          <span className="sr-only">Confirming your email…</span>
          <Skeleton className="mx-auto size-14 rounded-pill" />
          <Skeleton className="mx-auto h-5 w-3/5" />
        </div>
      </AuthShell>
    )
  }

  if (result.isError) {
    const error = result.error
    if (error instanceof ApiError && TOKEN_ERRORS_SET.has(error.code)) {
      return (
        <Failure
          title={TOKEN_TITLES[error.code]}
          message={
            error.code === 'token_used'
              ? 'If you already confirmed your email, you can go ahead and log in. Otherwise log in and choose "Resend link".'
              : 'Log in and choose "Resend link" to get a new one.'
          }
        />
      )
    }
    return (
      <AuthShell title="Confirming your email" centered>
        <ErrorState
          message={error.message}
          onRetry={() => void result.refetch()}
          retrying={result.isFetching}
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Email confirmed" lead="You can now apply for jobs." centered>
      <ResultIcon ok />
      <Link to={user ? '/account' : '/login'} className={buttonClasses({ fullWidth: true })}>
        {user ? 'Go to my account' : 'Log in'}
      </Link>
    </AuthShell>
  )
}

function Failure({ title, message }: { title: string; message: string }) {
  return (
    <AuthShell title={title} lead={message} centered>
      <ResultIcon ok={false} />
      <Link to="/login" className={buttonClasses({ fullWidth: true })}>
        Log in
      </Link>
    </AuthShell>
  )
}
