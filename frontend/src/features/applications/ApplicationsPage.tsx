import { Link, useSearchParams } from 'react-router-dom'
import { APPLICATION_PAGE_SIZE } from '../../api/applications'
import { buttonClasses } from '../../components/buttonStyles'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Pagination } from '../../components/Pagination'
import { Skeleton } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { formatDate } from '../../lib/dates'
import { useMyApplications } from './useApplications'

/** The job seeker's applications, newest first (mockup S8). */
export function ApplicationsPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const applications = useMyApplications(page)

  let body
  if (applications.isPending) {
    body = (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading your applications</span>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    )
  } else if (applications.isError) {
    body = (
      <ErrorState
        title="Could not load your applications"
        message="We could not reach the server. Check your connection and try again."
        retrying={applications.isFetching}
        onRetry={() => void applications.refetch()}
      />
    )
  } else if (applications.data.meta.total === 0) {
    body = (
      <EmptyState
        title="You have not applied for any jobs yet"
        description="When you apply, you can follow every application here."
        action={
          <Link to="/jobs" className={buttonClasses()}>
            Find jobs
          </Link>
        }
      />
    )
  } else {
    const { data, meta } = applications.data
    body = (
      <>
        <p className="text-sm text-text-secondary" aria-live="polite">
          {meta.total} {meta.total === 1 ? 'application' : 'applications'}
        </p>
        <ul className="space-y-3">
          {data.map((item) => (
            <li key={item.id}>
              <Link to={`/applications/${item.id}`} className="block rounded-card">
                <Card className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{item.vacancy.title}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-text-secondary">{item.vacancy.company_name}</p>
                  <p className="text-sm text-text-secondary">
                    Applied {formatDate(item.submitted_at)}
                    {item.updated_at !== item.submitted_at &&
                      ` · Updated ${formatDate(item.updated_at)}`}
                    {!item.vacancy.is_live && ' · Vacancy closed'}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        <Pagination
          page={meta.page}
          pageCount={Math.ceil(meta.total / APPLICATION_PAGE_SIZE)}
          label="Application pages"
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
    <section aria-labelledby="applications-title" className="space-y-4">
      <h1 id="applications-title" className="text-title-md font-semibold">
        My applications
      </h1>
      {body}
    </section>
  )
}
