import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ApiError, type VacancyDetail, type VacancyRequirement } from '../../api/types'
import { Badge } from '../../components/Badge'
import { buttonClasses } from '../../components/buttonStyles'
import { Card } from '../../components/Card'
import { CompanyAvatar } from '../../components/CompanyAvatar'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { formatDate } from '../../lib/dates'
import { closingSoonLabel, daysLeft, postedLabel } from '../../lib/relativeDates'
import { ApplyBar } from './ApplyBar'
import { BookmarkButton } from '../saved/BookmarkButton'
import { ReportVacancy } from './ReportVacancy'
import {
  ARRANGEMENT_LABELS,
  EMPLOYMENT_LABELS,
  experienceLabel,
  formatSalary,
  placeLabel,
} from './format'
import { useVacancy } from './useVacancies'

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  )
}

function RequirementList({ title, items }: { title: string; items: VacancyRequirement[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <h3 className="mb-1.5 font-semibold">{title}</h3>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item.id}>{item.label}</li>
        ))}
      </ul>
    </div>
  )
}

/** The vacancy itself. `embedded` is the right-hand pane of the job list (wide screens). */
export function VacancyArticle({
  data,
  back,
  embedded = false,
}: {
  data: VacancyDetail
  back?: ReactNode
  embedded?: boolean
}) {
  const Heading = embedded ? 'h2' : 'h1'
  const salary = formatSalary(data.salary_min, data.salary_max)
  const closing = closingSoonLabel(data.expires_at)
  const left = daysLeft(data.expires_at)
  const required = data.requirements.filter((item) => item.is_mandatory)
  const preferred = data.requirements.filter((item) => !item.is_mandatory)

  return (
    <article aria-labelledby="job-title" className="space-y-5 pb-4">
      {back}

      <header className="flex flex-wrap items-start gap-3">
        <CompanyAvatar
          name={data.employer.company_name}
          imageUrl={data.employer.logo_url}
          size="lg"
        />
        <div className="min-w-0 space-y-2 break-words">
          <Heading id="job-title" className="text-title-md font-semibold md:text-title-lg">
            {data.title}
          </Heading>
          <p className="text-lg text-text-secondary">{data.employer.company_name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-text-secondary">
            <span>{placeLabel(data.district_name, data.work_arrangement)}</span>
            <Badge tone="primary">{EMPLOYMENT_LABELS[data.employment_type]}</Badge>
            <span>{postedLabel(data.published_at)}</span>
          </div>
        </div>
      </header>

      <BookmarkButton vacancyId={data.id} title={data.title} variant="text" />

      {embedded && <ApplyBar vacancy={data} />}

      <div
        className={
          embedded ? undefined : 'md:grid md:grid-cols-[1fr_20rem] md:items-start md:gap-8'
        }
      >
        <div className="space-y-5">
          <Card aria-label="Key facts">
            <dl className="grid grid-cols-2 gap-3">
              {salary && <Fact label="Salary">{salary}</Fact>}
              <Fact label="Closes">
                {`${formatDate(data.expires_at)}${
                  left > 0 ? ` (${left} ${left === 1 ? 'day' : 'days'} left)` : ' (today)'
                }`}
              </Fact>
              <Fact label="Qualification">{data.min_qualification_level_name ?? 'No minimum'}</Fact>
              <Fact label="Experience">{experienceLabel(data.min_experience_years)}</Fact>
              <Fact label="Where">{ARRANGEMENT_LABELS[data.work_arrangement]}</Fact>
            </dl>
            {closing && <p className="mt-3 font-semibold text-warning">{closing}</p>}
          </Card>

          <section aria-labelledby="about-title" className="space-y-1.5">
            <h2 id="about-title" className="text-title-sm font-semibold">
              About the role
            </h2>
            <p className="break-words whitespace-pre-line">{data.description}</p>
          </section>

          {data.requirements.length > 0 && (
            <section aria-labelledby="requirements-title" className="space-y-3">
              <h2 id="requirements-title" className="text-title-sm font-semibold">
                Requirements
              </h2>
              <RequirementList title="Required" items={required} />
              <RequirementList title="Preferred" items={preferred} />
            </section>
          )}

          <ReportVacancy vacancyId={data.id} />
        </div>

        {!embedded && (
          <div className="mt-5 md:sticky md:top-6 md:mt-0">
            <ApplyBar vacancy={data} />
          </div>
        )}
      </div>
    </article>
  )
}

/** The vacancy shown inside the job list on wide screens: loads it, with its own states. */
export function VacancyPane({ id }: { id: string }) {
  const vacancy = useVacancy(id)
  if (vacancy.isPending) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading the vacancy</span>
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (vacancy.isError) {
    const gone = vacancy.error instanceof ApiError && vacancy.error.status === 404
    return gone ? (
      <p className="text-text-secondary">
        This vacancy is no longer available. Pick another job from the list.
      </p>
    ) : (
      <ErrorState
        title="Could not load this vacancy"
        message="We could not reach the server. Check your connection and try again."
        retrying={vacancy.isFetching}
        onRetry={() => void vacancy.refetch()}
      />
    )
  }
  return <VacancyArticle data={vacancy.data} embedded />
}

export function JobDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const vacancy = useVacancy(id)
  const from =
    typeof (location.state as { from?: unknown } | null)?.from === 'string'
      ? (location.state as { from: string }).from
      : ''
  const back = (
    <Link
      to={`/jobs${from.startsWith('?') ? from : ''}`}
      className="text-sm text-primary underline"
    >
      ‹ Back to results
    </Link>
  )

  if (vacancy.isPending) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading the vacancy</span>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (vacancy.isError) {
    const gone = vacancy.error instanceof ApiError && vacancy.error.status === 404
    return gone ? (
      <section aria-labelledby="gone-title" className="space-y-3">
        {back}
        <h1 id="gone-title" className="text-title-md font-semibold">
          This vacancy is no longer available
        </h1>
        <p className="text-text-secondary">
          It may have closed or reached its closing date. Look at the other open jobs.
        </p>
        <Link to="/jobs" className={buttonClasses()}>
          Find other jobs
        </Link>
      </section>
    ) : (
      <ErrorState
        title="Could not load this vacancy"
        message="We could not reach the server. Check your connection and try again."
        retrying={vacancy.isFetching}
        onRetry={() => void vacancy.refetch()}
      />
    )
  }

  return <VacancyArticle data={vacancy.data} back={back} />
}
