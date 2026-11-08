import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MANAGE_PAGE_SIZE } from '../../api/employerVacancies'
import { ApiError, type ManagedVacancy, type VacancyStatus } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { buttonClasses } from '../../components/buttonStyles'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Pagination } from '../../components/Pagination'
import { Pill } from '../../components/Pill'
import { Skeleton } from '../../components/Skeleton'
import { useToast } from '../../components/toastContext'
import { formatDate } from '../../lib/dates'
import { placeLabel } from '../vacancies/format'
import { PublishButton } from './PublishButton'
import { STATUS_LABELS, STATUS_TONES } from './verification'
import { useEmployer } from './useEmployerData'
import { useCloseVacancy, useMyVacancies, usePublishVacancy } from './vacancies/useManagedVacancies'
import { vacancyBadge } from './vacancies/vacancyStatus'

const FILTERS: { value: string; label: string; status: VacancyStatus | null }[] = [
  { value: 'all', label: 'All', status: null },
  { value: 'draft', label: 'Drafts', status: 'draft' },
  { value: 'published', label: 'Published', status: 'published' },
  { value: 'closed', label: 'Closed', status: 'closed' },
]

function whenLabel(vacancy: ManagedVacancy): string {
  if (vacancy.status === 'draft') return 'Not published yet'
  if (vacancy.status === 'closed') return 'Closed'
  if (!vacancy.expires_at) return ''
  return vacancy.is_live
    ? `Closes ${formatDate(vacancy.expires_at)}`
    : `Closed to applicants on ${formatDate(vacancy.expires_at)}`
}

/** The employer's home (mockup S9): the company and every one of its vacancies. */
export function EmployerDashboardPage() {
  const employer = useEmployer()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const filter = FILTERS.find((item) => item.value === params.get('status')) ?? FILTERS[0]
  const requestedPage = Number(params.get('page'))
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1
  const vacancies = useMyVacancies(filter.status, page)
  const publish = usePublishVacancy()
  const close = useCloseVacancy()
  const [closing, setClosing] = useState<ManagedVacancy | null>(null)
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null)

  function choose(value: string) {
    setParams(value === 'all' ? {} : { status: value })
  }

  function onPublish(vacancy: ManagedVacancy) {
    setProblem(null)
    publish.mutate(vacancy.id, {
      onSuccess: () => toast.show({ message: 'Vacancy published.', tone: 'success' }),
      onError: (error) => {
        if (error instanceof ApiError && error.status !== 0 && error.status < 500) {
          setProblem({ id: vacancy.id, message: error.message })
        } else {
          toast.show({ message: 'Something went wrong. Please try again.', tone: 'error' })
        }
      },
    })
  }

  function onConfirmClose() {
    if (!closing) return
    const wasDraft = closing.status === 'draft'
    close.mutate(closing.id, {
      onSuccess: () => {
        setClosing(null)
        toast.show({ message: wasDraft ? 'Draft discarded.' : 'Vacancy closed.', tone: 'success' })
      },
      onError: (error) => {
        setClosing(null)
        toast.show({
          message: error instanceof ApiError ? error.message : 'Something went wrong.',
          tone: 'error',
        })
      },
    })
  }

  const company = employer.data
  const total = vacancies.data?.meta.total ?? 0

  return (
    <section aria-labelledby="employer-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 id="employer-title" className="text-title-md font-semibold">
            {company?.company_name ?? 'Your vacancies'}
          </h1>
          {company && (
            <Badge tone={STATUS_TONES[company.verification_status]}>
              {STATUS_LABELS[company.verification_status]}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Link to="/employer/profile" className={buttonClasses({ variant: 'secondary' })}>
            Company profile
          </Link>
          {company && (
            <Link to="/employer/vacancies/new" className={buttonClasses()}>
              New vacancy
            </Link>
          )}
        </div>
      </div>

      {employer.isSuccess && !company ? (
        <EmptyState
          title="Set up your company profile first"
          description="You need a company profile before you can write vacancies."
          action={
            <Link to="/employer/profile" className={buttonClasses()}>
              Set up company profile
            </Link>
          }
        />
      ) : (
        <>
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <Pill
                key={item.value}
                label={item.label}
                selected={item.value === filter.value}
                onClick={() => choose(item.value)}
              />
            ))}
          </div>

          {problem && (
            <Alert>
              {problem.message}{' '}
              <Link to={`/employer/vacancies/${problem.id}`} className="font-semibold underline">
                Open it to fix
              </Link>
            </Alert>
          )}

          {vacancies.isPending ? (
            <div role="status" className="space-y-3">
              <span className="sr-only">Loading your vacancies</span>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : vacancies.isError ? (
            <ErrorState
              title="Could not load your vacancies"
              message="We could not reach the server. Check your connection and try again."
              retrying={vacancies.isFetching}
              onRetry={() => void vacancies.refetch()}
            />
          ) : vacancies.data.data.length === 0 ? (
            <EmptyState
              title={
                filter.status ? `No ${filter.label.toLowerCase()} vacancies` : 'No vacancies yet'
              }
              description={
                filter.status ? undefined : 'Write your first vacancy. You can save it as a draft.'
              }
              action={
                !filter.status ? (
                  <Link to="/employer/vacancies/new" className={buttonClasses()}>
                    New vacancy
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <p className="text-sm text-text-secondary" aria-live="polite">
                {total} {total === 1 ? 'vacancy' : 'vacancies'}
              </p>
              <ul className="space-y-3">
                {vacancies.data.data.map((vacancy) => {
                  const badge = vacancyBadge(vacancy)
                  return (
                    <li key={vacancy.id}>
                      <Card className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="text-lg font-semibold">{vacancy.title}</h2>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </div>
                        <p className="text-sm text-text-secondary">
                          {[
                            vacancy.work_arrangement
                              ? placeLabel(null, vacancy.work_arrangement)
                              : null,
                            whenLabel(vacancy),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {vacancy.status !== 'draft' &&
                          vacancy.application_method === 'internal' && (
                            <p className="flex flex-wrap items-center gap-2 text-sm">
                              <Link
                                to={`/employer/vacancies/${vacancy.id}/applicants`}
                                aria-label={`Applicants for ${vacancy.title}`}
                                className="font-semibold text-primary underline"
                              >
                                {vacancy.application_count}{' '}
                                {vacancy.application_count === 1 ? 'applicant' : 'applicants'}
                              </Link>
                              {vacancy.new_application_count > 0 && (
                                <Badge tone="info">{vacancy.new_application_count} new</Badge>
                              )}
                            </p>
                          )}
                        {vacancy.status !== 'closed' && (
                          <div className="flex flex-wrap items-start gap-2 pt-1">
                            <Link
                              to={`/employer/vacancies/${vacancy.id}`}
                              aria-label={`Edit ${vacancy.title}`}
                              className={buttonClasses({ variant: 'secondary' })}
                            >
                              Edit
                            </Link>
                            {vacancy.status === 'draft' && (
                              <div>
                                <PublishButton fullWidth={false} onClick={() => onPublish(vacancy)}>
                                  Publish
                                </PublishButton>
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              aria-label={`${vacancy.status === 'draft' ? 'Discard' : 'Close'} ${vacancy.title}`}
                              onClick={() => setClosing(vacancy)}
                            >
                              {vacancy.status === 'draft' ? 'Discard…' : 'Close…'}
                            </Button>
                          </div>
                        )}
                      </Card>
                    </li>
                  )
                })}
              </ul>
              <Pagination
                page={vacancies.data.meta.page}
                pageCount={Math.ceil(total / MANAGE_PAGE_SIZE)}
                label="Vacancy pages"
                onPageChange={(next) => {
                  const nextParams = new URLSearchParams(params)
                  nextParams.set('page', String(next))
                  setParams(nextParams)
                }}
              />
              <p className="text-sm text-text-secondary">
                Applicant counts will appear on each vacancy in a later release.
              </p>
            </>
          )}
        </>
      )}

      <Modal
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={closing?.status === 'draft' ? 'Discard this draft?' : `Close “${closing?.title}”?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={onConfirmClose} loading={close.isPending}>
              {closing?.status === 'draft' ? 'Discard draft' : 'Close vacancy'}
            </Button>
          </>
        }
      >
        <p>
          {closing?.status === 'draft'
            ? 'The draft will be removed and cannot be brought back.'
            : 'It disappears from the job list straight away and cannot be reopened. You can post a new vacancy instead.'}
        </p>
      </Modal>
    </section>
  )
}
