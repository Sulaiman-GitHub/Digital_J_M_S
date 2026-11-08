import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { useToast } from '../../components/toastContext'
import { formatDateTime } from '../../lib/dates'
import { serverFieldErrors } from '../../lib/formErrors'
import { STATUS_LABELS, STATUS_TONES } from '../employers/verification'
import { ReasonDialog } from './ReasonDialog'
import { refreshEmployer, useDecide, useEmployerDetail } from './useAdminEmployers'
import { VerificationChecklist } from './VerificationChecklist'
import { VerificationHistory } from './VerificationHistory'

type Dialog = 'reject' | 'suspend' | null

export function EmployerDetailPage() {
  const { id = '' } = useParams()
  const detail = useEmployerDetail(id)
  const decide = useDecide(id)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)

  if (detail.isPending) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading employer</span>
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (detail.isError) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404
    return missing ? (
      <section className="space-y-3">
        <h1 className="text-title-md font-semibold">Employer not found</h1>
        <Link to="/admin/employers" className="text-primary underline">
          Back to all employers
        </Link>
      </section>
    ) : (
      <ErrorState
        title="Could not load this employer"
        message="We could not reach the server. Check your connection and try again."
        retrying={detail.isFetching}
        onRetry={() => void detail.refetch()}
      />
    )
  }

  const employer = detail.data
  const status = employer.verification_status

  function onError(error: unknown) {
    setDialog(null)
    if (error instanceof ApiError && error.status === 409) {
      // Someone else decided first, or the employer changed it: show the current state.
      setFailure(`${error.message} The page now shows the latest state.`)
      void refreshEmployer(queryClient, id)
      return
    }
    if (error instanceof ApiError && error.status !== 0 && error.status < 500) {
      setFailure(error.message)
      return
    }
    toast.show({
      message:
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      tone: 'error',
    })
  }

  function run(decision: Parameters<typeof decide.mutate>[0], done: string) {
    setFailure(null)
    setReasonError(null)
    decide.mutate(decision, {
      onSuccess: () => {
        setDialog(null)
        toast.show({ message: done, tone: 'success' })
      },
      onError: (error) => {
        const reason = serverFieldErrors(error).reason
        if (reason) setReasonError(reason)
        else onError(error)
      },
    })
  }

  return (
    <section aria-labelledby="employer-title" className="space-y-4">
      <Link to="/admin/employers" className="text-sm text-primary underline">
        ‹ All employers
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="employer-title" className="text-title-md font-semibold">
          {employer.company_name}
        </h1>
        <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
      </div>

      {failure && <Alert>{failure}</Alert>}
      {status === 'approved' && (
        <Alert tone="info">
          Suspending stops new publishing. Vacancies that are already live stay as they are.
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="space-y-4">
          <VerificationChecklist employer={employer} />
          <Card aria-labelledby="profile-title">
            <h2 id="profile-title" className="text-lg font-semibold">
              Profile
            </h2>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              <Fact label="District" value={employer.district_name} />
              <Fact label="Phone" value={employer.contact_phone} />
              <Fact label="Website" value={employer.website} />
              <Fact
                label="Sent"
                value={employer.submitted_at ? formatDateTime(employer.submitted_at) : null}
              />
              <div className="sm:col-span-2">
                <dt className="text-sm text-text-secondary">About</dt>
                <dd className="break-words whitespace-pre-line">
                  {employer.description ?? 'Not provided'}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
        <VerificationHistory history={employer.history} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {status === 'pending' && (
          <>
            <Button
              loading={decide.isPending && decide.variables?.kind === 'approve'}
              disabled={decide.isPending}
              onClick={() => run({ kind: 'approve' }, 'Company approved.')}
            >
              Approve
            </Button>
            <Button variant="secondary" onClick={() => setDialog('reject')}>
              Reject…
            </Button>
          </>
        )}
        {status === 'approved' && (
          <Button variant="danger" onClick={() => setDialog('suspend')}>
            Suspend…
          </Button>
        )}
        {status === 'suspended' && (
          <Button
            loading={decide.isPending && decide.variables?.kind === 'approve'}
            disabled={decide.isPending}
            onClick={() => run({ kind: 'approve' }, 'Company approved again.')}
          >
            Approve again
          </Button>
        )}
        {(status === 'draft' || status === 'rejected') && (
          <p className="text-text-secondary">Waiting for the employer.</p>
        )}
      </div>

      <ReasonDialog
        open={dialog === 'reject'}
        title={`Reject ${employer.company_name}?`}
        description="The employer will see your reason and can fix the profile and send it again."
        confirmLabel="Reject"
        busy={decide.isPending}
        serverError={reasonError}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => run({ kind: 'reject', reason }, 'Company rejected.')}
      />
      <ReasonDialog
        open={dialog === 'suspend'}
        title={`Suspend ${employer.company_name}?`}
        description="The employer cannot post new vacancies until you approve them again. They will see your reason."
        confirmLabel="Suspend"
        busy={decide.isPending}
        serverError={reasonError}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => run({ kind: 'suspend', reason }, 'Company suspended.')}
      />
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="font-semibold break-words">{value ?? 'Not provided'}</dd>
    </div>
  )
}
