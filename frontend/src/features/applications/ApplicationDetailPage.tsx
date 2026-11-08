import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { buttonClasses } from '../../components/buttonStyles'
import { Card } from '../../components/Card'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Skeleton } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { StatusTimeline } from '../../components/StatusTimeline'
import { useToast } from '../../components/toastContext'
import { formatDateTime } from '../../lib/dates'
import { useApplication, useWithdraw } from './useApplications'

/** One of the job seeker's applications with its history, and Withdraw (mockup S8). */
export function ApplicationDetailPage() {
  const { id = '' } = useParams()
  const application = useApplication(id)
  const withdraw = useWithdraw(id)
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const back = (
    <Link to="/applications" className="text-sm text-primary underline">
      ‹ My applications
    </Link>
  )

  if (application.isPending) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading your application</span>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (application.isError) {
    const missing = application.error instanceof ApiError && application.error.status === 404
    return missing ? (
      <section className="space-y-3">
        {back}
        <h1 className="text-title-md font-semibold">We could not find this application</h1>
        <p className="text-text-secondary">It may belong to someone else, or no longer exist.</p>
        <Link to="/applications" className={buttonClasses()}>
          See my applications
        </Link>
      </section>
    ) : (
      <ErrorState
        title="Could not load this application"
        message="We could not reach the server. Check your connection and try again."
        retrying={application.isFetching}
        onRetry={() => void application.refetch()}
      />
    )
  }

  const data = application.data
  const canWithdraw = data.next_statuses.includes('withdrawn')
  // The timeline shows the newest change first.
  const entries = [...data.history].reverse().map((item) => ({
    status: item.to_status,
    at: item.created_at,
    note: item.note ?? undefined,
  }))

  const confirm = () => {
    setProblem(null)
    withdraw.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false)
        toast.show({ message: 'Application withdrawn.', tone: 'success' })
      },
      onError: (error) => {
        setProblem(
          error instanceof ApiError
            ? error.message
            : 'We could not withdraw your application. Please try again.',
        )
      },
    })
  }

  return (
    <article aria-labelledby="application-title" className="space-y-5 pb-4">
      {back}
      <header className="space-y-1">
        <h1 id="application-title" className="text-title-md font-semibold">
          {data.vacancy.title}
        </h1>
        <p className="text-text-secondary">
          {data.vacancy.company_name}
          {data.vacancy.is_live && (
            <>
              {' · '}
              <Link to={`/jobs/${data.vacancy.id}`} className="text-primary underline">
                See the vacancy
              </Link>
            </>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge status={data.status} />
          <span className="text-sm text-text-secondary">
            Updated {formatDateTime(data.updated_at)}
          </span>
        </p>
      </header>

      <Card>
        <h2 className="mb-3 text-title-sm font-semibold">History</h2>
        <StatusTimeline entries={entries} />
      </Card>

      <Card className="space-y-2">
        <h2 className="text-title-sm font-semibold">What you sent</h2>
        <p className="text-sm text-text-secondary">CV: {data.cv.original_filename}</p>
        {data.cover_note ? (
          <div>
            <p className="text-sm text-text-secondary">Cover note</p>
            <p className="break-words whitespace-pre-line">{data.cover_note}</p>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No cover note.</p>
        )}
      </Card>

      {canWithdraw && (
        <Button variant="secondary" fullWidth onClick={() => setConfirming(true)}>
          Withdraw application…
        </Button>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Withdraw this application?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep application
            </Button>
            <Button variant="danger" loading={withdraw.isPending} onClick={confirm}>
              Withdraw
            </Button>
          </>
        }
      >
        {problem && <Alert tone="danger">{problem}</Alert>}
        <p className="text-text-secondary">
          The employer will see that you withdrew. You cannot apply for this vacancy again.
        </p>
      </Modal>
    </article>
  )
}
