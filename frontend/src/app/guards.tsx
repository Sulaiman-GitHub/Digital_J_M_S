import { Link, Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import type { UserRole } from '../api/types'
import { buttonClasses } from '../components/buttonStyles'
import { ErrorState } from '../components/ErrorState'
import { Skeleton } from '../components/Skeleton'
import { useAuth } from '../features/auth/authContext'
import { safeNextPath } from '../lib/safeRedirect'

function PageLoading() {
  return (
    <div role="status" className="space-y-3 py-6">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-7 w-2/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  )
}

/** Logged-in users only. Others go to /login and come back afterwards (?next=). */
export function RequireAuth() {
  const { status, refetch } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <PageLoading />
  if (status === 'error') {
    return (
      <ErrorState
        title="Could not check your session"
        message="We could not reach the server. Check your connection and try again."
        onRetry={refetch}
      />
    )
  }
  if (status === 'unauthenticated') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <Outlet />
}

/**
 * Use inside RequireAuth. Shows a "no permission" page for other roles.
 * The server enforces roles too; this only keeps people out of screens that would not work.
 */
export function RequireRole({ roles }: { roles: readonly UserRole[] }) {
  const { user } = useAuth()
  if (!user) return null
  if (!roles.includes(user.role)) return <ForbiddenPage />
  return <Outlet />
}

export function ForbiddenPage() {
  return (
    <section aria-labelledby="forbidden-title" className="space-y-4">
      <h1 id="forbidden-title" className="text-title-md font-semibold">
        You do not have permission to see this page
      </h1>
      <p className="text-text-secondary">
        This page is for a different kind of account. Go back and choose something else.
      </p>
      <Link to="/" className={buttonClasses({ variant: 'secondary' })}>
        Go to the home page
      </Link>
    </section>
  )
}

/** Login and register pages: logged-in users are sent on instead (to ?next= or /account). */
export function RedirectIfAuthenticated() {
  const { status, user } = useAuth()
  const [params] = useSearchParams()

  if (status === 'authenticated' && user) {
    return <Navigate to={safeNextPath(params.get('next')) ?? '/account'} replace />
  }
  return <Outlet />
}
