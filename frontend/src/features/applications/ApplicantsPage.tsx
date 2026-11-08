import { Link, useParams, useSearchParams } from 'react-router-dom'
import { APPLICANT_PAGE_SIZE } from '../../api/applications'
import { applicantPhotoUrl } from '../../api/pictures'
import { ApiError } from '../../api/types'
import { Card } from '../../components/Card'
import { CompanyAvatar } from '../../components/CompanyAvatar'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Pagination } from '../../components/Pagination'
import { Pill } from '../../components/Pill'
import { Skeleton } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { formatDate } from '../../lib/dates'
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '../../lib/applicationStatus'
import { useApplicants } from './useApplications'

/** The people who applied for one vacancy (mockup S11), newest first, filterable by status. */
export function ApplicantsPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const requestedStatus = params.get('status')
  const status =
    APPLICATION_STATUSES.find((item) => item === requestedStatus) ??
    (null as ApplicationStatus | null)
  const requested = Number(params.get('page'))
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1
  const applicants = useApplicants(id, status, page)

  function choose(next: ApplicationStatus | null) {
    setParams(next ? { status: next } : {})
  }

  const back = (
    <Link to="/employer" className="text-sm text-primary underline">
      ‹ My vacancies
    </Link>
  )

  let body
  if (applicants.isPending) {
    body = (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading applicants</span>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    )
  } else if (applicants.isError) {
    const missing = applicants.error instanceof ApiError && applicants.error.status === 404
    body = missing ? (
      <EmptyState
        title="We could not find this vacancy"
        description="It may belong to another company, or no longer exist."
        action={back}
      />
    ) : (
      <ErrorState
        title="Could not load the applicants"
        message="We could not reach the server. Check your connection and try again."
        retrying={applicants.isFetching}
        onRetry={() => void applicants.refetch()}
      />
    )
  } else if (applicants.data.meta.total === 0) {
    body = (
      <EmptyState
        title={status ? 'No applicants with this status' : 'No one has applied yet'}
        description={
          status
            ? 'Choose another status to see the others.'
            : 'When someone applies, you will see them here.'
        }
      />
    )
  } else {
    const { data, meta } = applicants.data
    body = (
      <>
        <p className="text-sm text-text-secondary" aria-live="polite">
          {meta.total} {meta.total === 1 ? 'applicant' : 'applicants'}
        </p>
        <ul className="space-y-3">
          {data.map((item) => (
            <li key={item.id}>
              <Link to={`/employer/applications/${item.id}`} className="block rounded-card">
                <Card className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-3 font-semibold">
                      <CompanyAvatar
                        name={item.applicant_name}
                        imageUrl={applicantPhotoUrl(item.id)}
                        round
                      />
                      {item.applicant_name}
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-text-secondary">
                    {[item.qualification, item.institution].filter(Boolean).join(' · ') ||
                      'No qualification given'}
                  </p>
                  <p className="text-sm text-text-secondary">
                    Applied {formatDate(item.submitted_at)}
                    {item.has_cover_note && ' · Cover note'}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        <Pagination
          page={meta.page}
          pageCount={Math.ceil(meta.total / APPLICANT_PAGE_SIZE)}
          label="Applicant pages"
          onPageChange={(next) => {
            const nextParams = new URLSearchParams(params)
            nextParams.set('page', String(next))
            setParams(nextParams)
          }}
        />
      </>
    )
  }

  return (
    <section aria-labelledby="applicants-title" className="space-y-4">
      {back}
      <h1 id="applicants-title" className="text-title-md font-semibold">
        Applicants
      </h1>
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        <Pill label="All" selected={status === null} onClick={() => choose(null)} />
        {APPLICATION_STATUSES.map((item) => (
          <Pill
            key={item}
            label={APPLICATION_STATUS_LABELS[item]}
            selected={status === item}
            onClick={() => choose(item)}
          />
        ))}
      </div>
      {body}
    </section>
  )
}
