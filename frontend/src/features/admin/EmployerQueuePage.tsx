import { Link, useSearchParams } from 'react-router-dom'
import { QUEUE_PAGE_SIZE } from '../../api/adminEmployers'
import type { VerificationStatus } from '../../api/types'
import { Badge } from '../../components/Badge'
import { buttonClasses } from '../../components/buttonStyles'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Pagination } from '../../components/Pagination'
import { Skeleton } from '../../components/Skeleton'
import { cn } from '../../lib/cn'
import { formatDateTime } from '../../lib/dates'
import { STATUS_LABELS, STATUS_TONES } from '../employers/verification'
import { useEmployerQueue } from './useAdminEmployers'

const FILTERS: { value: string; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'draft', label: 'Not sent' },
  { value: 'all', label: 'All' },
]
const KNOWN = new Set(FILTERS.map((filter) => filter.value))

function parsePage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

/** Employers waiting for a decision, and every other employer, newest sent first. */
export function EmployerQueuePage() {
  const [params, setParams] = useSearchParams()
  const rawFilter = params.get('status') ?? 'pending'
  const filter = KNOWN.has(rawFilter) ? rawFilter : 'pending'
  const status = filter === 'all' ? null : (filter as VerificationStatus)
  const page = parsePage(params.get('page'))
  const queue = useEmployerQueue(status, page)

  function choose(value: string) {
    const next = new URLSearchParams()
    if (value !== 'pending') next.set('status', value)
    setParams(next)
  }

  const label = FILTERS.find((item) => item.value === filter)?.label.toLowerCase() ?? ''

  return (
    <section aria-labelledby="queue-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="queue-title" className="text-title-md font-semibold">
          Employers
        </h1>
        <Link to="/admin/vacancies/new" className={buttonClasses({ variant: 'secondary' })}>
          New vacancy for a partner
        </Link>
      </div>

      <div role="group" aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={item.value === filter}
            onClick={() => choose(item.value)}
            className={cn(
              'inline-flex min-h-11 cursor-pointer items-center rounded-pill border px-3.5 text-sm font-medium whitespace-nowrap',
              item.value === filter
                ? 'border-primary bg-primary text-white'
                : 'border-text-secondary bg-white text-text',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {queue.isPending ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading employers</span>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : queue.isError ? (
        <ErrorState
          title="Could not load employers"
          message="We could not reach the server. Check your connection and try again."
          retrying={queue.isFetching}
          onRetry={() => void queue.refetch()}
        />
      ) : queue.data.data.length === 0 ? (
        <EmptyState
          title={filter === 'pending' ? 'No employers waiting' : `No ${label} employers`}
          description={
            filter === 'pending'
              ? 'New requests appear here when an employer sends their company for checking.'
              : undefined
          }
        />
      ) : (
        <>
          <p className="text-sm text-text-secondary" aria-live="polite">
            {queue.data.meta.total} {queue.data.meta.total === 1 ? 'employer' : 'employers'}
          </p>
          <ul className="space-y-3">
            {queue.data.data.map((employer) => (
              <li key={employer.id}>
                <Link to={`/admin/employers/${employer.id}`} className="block">
                  <Card className="hover:border-primary">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-lg font-semibold">{employer.company_name}</span>
                      <Badge tone={STATUS_TONES[employer.verification_status]}>
                        {STATUS_LABELS[employer.verification_status]}
                      </Badge>
                    </div>
                    <p className="text-text-secondary break-words">{employer.owner_email}</p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {employer.district_name}
                      {employer.submitted_at && ` · Sent ${formatDateTime(employer.submitted_at)}`}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={queue.data.meta.page}
            pageCount={Math.ceil(queue.data.meta.total / QUEUE_PAGE_SIZE)}
            label="Employer pages"
            onPageChange={(next) => {
              const nextParams = new URLSearchParams(params)
              nextParams.set('page', String(next))
              setParams(nextParams)
            }}
          />
        </>
      )}
    </section>
  )
}
