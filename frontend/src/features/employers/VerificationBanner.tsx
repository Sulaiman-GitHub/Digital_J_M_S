import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Employer } from '../../api/types'
import { Button } from '../../components/Button'
import { buttonClasses } from '../../components/buttonStyles'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/dates'
import { useEmployer } from './useEmployerData'

type Tone = 'info' | 'warning' | 'success' | 'danger'

const TONE_CLASSES: Record<Tone, string> = {
  info: 'border-info bg-info-tint [&_strong.title]:text-info',
  warning: 'border-warning bg-warning-tint [&_strong.title]:text-warning',
  success: 'border-success bg-success-tint [&_strong.title]:text-success',
  danger: 'border-danger bg-danger-tint [&_strong.title]:text-danger',
}
const ICONS: Record<Tone, string> = { info: 'i', warning: '…', success: '✓', danger: '!' }

function Band({
  tone,
  title,
  children,
  action,
}: {
  tone: Tone
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-testid="verification-banner"
      className={cn('border-b', TONE_CLASSES[tone])}
    >
      <div className="mx-auto flex max-w-5xl gap-2.5 px-4 py-3">
        <span aria-hidden="true" className="flex-none font-bold">
          {ICONS[tone]}
        </span>
        <div className="space-y-1">
          <strong className="title block">{title}</strong>
          {children && <div>{children}</div>}
          {action && <div className="pt-1">{action}</div>}
        </div>
      </div>
    </div>
  )
}

function Reason({ children }: { children: string }) {
  return (
    <blockquote className="mt-1.5 border-l-4 border-danger bg-card px-3 py-2 text-sm">
      {children}
    </blockquote>
  )
}

/** The text and tone for each status. Exported so tests and other screens can reuse the copy. */
export function BannerFor({ employer }: { employer: Employer | null }) {
  const profileLink = (label: string, variant: 'primary' | 'secondary' = 'primary') => (
    <Link to="/employer/profile" className={buttonClasses({ variant })}>
      {label}
    </Link>
  )

  if (!employer || employer.verification_status === 'draft') {
    return (
      <Band
        tone="info"
        title="Your company is not verified yet"
        action={profileLink(employer ? 'Complete company profile' : 'Set up company profile')}
      >
        Complete your company profile and send it for verification. You can post vacancies once it
        is approved.
      </Band>
    )
  }

  switch (employer.verification_status) {
    case 'pending':
      return (
        <Band tone="warning" title="We are checking your company">
          {employer.submitted_at &&
            `You sent your profile on ${formatDate(employer.submitted_at)}. `}
          You cannot edit it or post vacancies until we have decided.
        </Band>
      )
    case 'approved':
      return (
        <Band tone="success" title="Your company is verified">
          You can post vacancies.
        </Band>
      )
    case 'rejected':
      return (
        <Band
          tone="danger"
          title="Your company was not approved"
          action={profileLink('Edit and send again')}
        >
          Fix the points below, then send it again.
          {employer.status_reason && <Reason>{employer.status_reason}</Reason>}
        </Band>
      )
    case 'suspended':
      return (
        <Band tone="danger" title="Your company is suspended">
          You cannot post new vacancies. Vacancies that are already live stay as they are.
          {employer.status_reason && <Reason>{employer.status_reason}</Reason>}
        </Band>
      )
  }
}

/** Sits under the header on every employer page. Says what the status means and what to do. */
export function VerificationBanner() {
  const employer = useEmployer()

  if (employer.isPending) return null
  if (employer.isError) {
    return (
      <Band
        tone="danger"
        title="Could not check your company status"
        action={
          <Button variant="secondary" onClick={() => void employer.refetch()}>
            Retry
          </Button>
        }
      />
    )
  }
  return <BannerFor employer={employer.data ?? null} />
}
