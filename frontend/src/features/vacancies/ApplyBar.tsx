import { Link, useLocation } from 'react-router-dom'
import type { VacancyDetail } from '../../api/types'
import { buttonClasses } from '../../components/buttonStyles'
import { StatusBadge } from '../../components/StatusBadge'
import { cn } from '../../lib/cn'
import { useAuth } from '../auth/authContext'
import { useMyApplicationFor } from '../applications/useApplications'
import { hostOf } from './format'

/**
 * The call to action at the bottom of a vacancy (mockup S4). What it offers depends on who is
 * looking and how the vacancy takes applications:
 * - external: a clear notice, then a button that opens the employer's site in a new tab
 * - anonymous: log in first, and come back here afterwards
 * - job seeker: Apply (to the apply page), "Applied" with the status once they have; an unverified
 *   email says so instead
 * - employer or admin: nothing
 */
export function ApplyBar({ vacancy }: { vacancy: VacancyDetail }) {
  const { user, status } = useAuth()
  const location = useLocation()
  const here = encodeURIComponent(location.pathname + location.search)

  // Job seekers have a bottom navigation on phones: sit above it, never behind it.
  const bottom = user?.role === 'job_seeker' ? 'bottom-14' : 'bottom-0'
  const bar = cn(
    'sticky z-10 -mx-4 border-t border-border bg-white px-4 py-3 md:static md:mx-0 md:rounded-card md:border md:p-4',
    bottom,
    'md:bottom-auto',
  )

  if (vacancy.application_method === 'external' && vacancy.external_url) {
    return (
      <div className={bar}>
        <p className="mb-2 rounded-card border border-info bg-info-tint p-3 text-sm">
          <strong className="text-info">You will apply on another website.</strong> Applications
          there are not tracked here, and we cannot show you their status.
        </p>
        <a
          href={vacancy.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ fullWidth: true })}
        >
          Continue to employer site
        </a>
        <p className="mt-1.5 text-center text-sm text-text-secondary">
          Opens {hostOf(vacancy.external_url)} in a new tab.
        </p>
      </div>
    )
  }

  if (status === 'loading') return null
  if (user && user.role !== 'job_seeker') return null

  if (!user) {
    return (
      <div className={bar}>
        <Link to={`/login?next=${here}`} className={buttonClasses({ fullWidth: true })}>
          Log in to apply
        </Link>
        <p className="mt-1.5 text-center text-sm text-text-secondary">
          Your profile, CV and photo (if you added one) are sent with your application. You can
          withdraw later.
        </p>
      </div>
    )
  }

  return <SeekerApply vacancy={vacancy} bar={bar} verified={user.email_verified} />
}

/** What a job seeker sees: Apply, or the state of the application they already made. */
function SeekerApply({
  vacancy,
  bar,
  verified,
}: {
  vacancy: VacancyDetail
  bar: string
  verified: boolean
}) {
  const applied = useMyApplicationFor(vacancy.id, true)

  if (applied.data) {
    return (
      <div className={bar}>
        <p className="mb-2 flex flex-wrap items-center gap-2">
          <strong>Applied</strong>
          <StatusBadge status={applied.data.status} />
        </p>
        <Link
          to={`/applications/${applied.data.id}`}
          className={buttonClasses({ variant: 'secondary', fullWidth: true })}
        >
          See your application
        </Link>
      </div>
    )
  }

  if (!verified) {
    const reasonId = 'apply-why'
    return (
      <div className={bar}>
        <button
          type="button"
          aria-disabled="true"
          aria-describedby={reasonId}
          title="Verify your email to apply"
          onClick={(event) => event.preventDefault()}
          className={cn(
            buttonClasses({ fullWidth: true }),
            'cursor-not-allowed border-border bg-surface text-text-secondary hover:bg-surface',
          )}
        >
          Apply
        </button>
        <p id={reasonId} className="mt-1.5 text-center text-sm text-text-secondary">
          Verify your email address to apply. We sent you a link.
        </p>
      </div>
    )
  }

  return (
    <div className={bar}>
      <Link to={`/jobs/${vacancy.id}/apply`} className={buttonClasses({ fullWidth: true })}>
        Apply
      </Link>
      <p className="mt-1.5 text-center text-sm text-text-secondary">
        Your profile, CV and photo (if you added one) are sent with your application. You can
        withdraw later.
      </p>
    </div>
  )
}
