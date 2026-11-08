import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { REPORT_PAGE_SIZE, listReports, resolveReport } from '../../api/reports'
import { ApiError, type AdminReport, type ReportStatus } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Checkbox } from '../../components/Checkbox'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Pagination } from '../../components/Pagination'
import { Pill } from '../../components/Pill'
import { Skeleton } from '../../components/Skeleton'
import { TextArea } from '../../components/TextArea'
import { useToast } from '../../components/toastContext'
import { formatDate } from '../../lib/dates'
import { serverFieldErrors } from '../../lib/formErrors'
import { REASON_LABELS } from '../vacancies/reportReasons'

const FILTERS: { value: string; label: string; status: ReportStatus | null }[] = [
  { value: 'open', label: 'Open', status: 'open' },
  { value: 'actioned', label: 'Actioned', status: 'actioned' },
  { value: 'dismissed', label: 'Dismissed', status: 'dismissed' },
  { value: 'all', label: 'All', status: null },
]

const STATUS_TONES = { open: 'warning', actioned: 'danger', dismissed: 'neutral' } as const

/** The reports admins work through (mockup S13): what was reported, and Dismiss or Close vacancy. */
export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const filter = FILTERS.find((item) => item.value === params.get('status')) ?? FILTERS[0]
  const requested = Number(params.get('page'))
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1
  const reports = useQuery({
    queryKey: ['admin-reports', filter.status, page],
    queryFn: ({ signal }) => listReports(filter.status, page, signal),
    placeholderData: (previous) => previous,
  })
  const [reviewing, setReviewing] = useState<AdminReport | null>(null)
  const total = reports.data?.meta.total ?? 0

  function choose(value: string) {
    setParams(value === 'open' ? {} : { status: value })
  }

  return (
    <section aria-labelledby="reports-title" className="space-y-4">
      <h1 id="reports-title" className="text-title-md font-semibold">
        Reports
      </h1>

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

      {reports.isPending ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading reports</span>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : reports.isError ? (
        <ErrorState
          title="Could not load reports"
          message="We could not reach the server. Check your connection and try again."
          retrying={reports.isFetching}
          onRetry={() => void reports.refetch()}
        />
      ) : reports.data.data.length === 0 ? (
        <EmptyState
          title={
            filter.status === 'open'
              ? 'No open reports'
              : `No ${filter.label.toLowerCase()} reports`
          }
          description={
            filter.status === 'open' ? 'Reports from job seekers appear here.' : undefined
          }
        />
      ) : (
        <>
          <p className="text-sm text-text-secondary" aria-live="polite">
            {total} {total === 1 ? 'report' : 'reports'}
          </p>
          <ul className="space-y-3">
            {reports.data.data.map((report) => (
              <li key={report.id}>
                <Card className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold">{report.vacancy.title}</h2>
                    <Badge tone={report.status === 'open' ? 'danger' : STATUS_TONES[report.status]}>
                      {report.status === 'open'
                        ? REASON_LABELS[report.reason]
                        : capitalise(report.status)}
                    </Badge>
                  </div>
                  <p className="text-text-secondary">{report.vacancy.company_name}</p>
                  {report.status !== 'open' && (
                    <p className="text-sm text-text-secondary">{REASON_LABELS[report.reason]}</p>
                  )}
                  {report.details && (
                    <blockquote className="rounded-card bg-surface px-3 py-2 text-sm break-words">
                      {report.details}
                    </blockquote>
                  )}
                  <p className="text-sm text-text-secondary">
                    {report.open_reports_for_vacancy > 0 &&
                      `${report.open_reports_for_vacancy} open ${
                        report.open_reports_for_vacancy === 1 ? 'report' : 'reports'
                      } · `}
                    Reported {formatDate(report.created_at)}
                    {report.reporter_email && ` by ${report.reporter_email}`}
                  </p>
                  <Button
                    variant="secondary"
                    aria-label={`Review the report on ${report.vacancy.title}`}
                    onClick={() => setReviewing(report)}
                  >
                    {report.status === 'open' ? 'Review' : 'View'}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination
            page={reports.data.meta.page}
            pageCount={Math.ceil(total / REPORT_PAGE_SIZE)}
            label="Report pages"
            onPageChange={(next) => {
              const nextParams = new URLSearchParams(params)
              nextParams.set('page', String(next))
              setParams(nextParams)
            }}
          />
        </>
      )}

      <ReviewDialog report={reviewing} onClose={() => setReviewing(null)} />
    </section>
  )
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function ReviewDialog({ report, onClose }: { report: AdminReport | null; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [suspend, setSuspend] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [failure, setFailure] = useState<string | null>(null)
  const [shownId, setShownId] = useState<string | null>(null)
  if ((report?.id ?? null) !== shownId) {
    // A different report was opened: start with a clean form.
    setShownId(report?.id ?? null)
    setSuspend(false)
    setReason('')
    setReasonError(undefined)
    setFailure(null)
  }

  const resolve = useMutation({
    mutationFn: (input: { action: 'dismiss' | 'action'; suspend: boolean }) =>
      resolveReport((report as AdminReport).id, {
        action: input.action,
        suspend_employer: input.suspend,
        note: input.suspend ? reason.trim() : null,
      }),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      void queryClient.invalidateQueries({ queryKey: ['vacancies'] })
      toast.show({
        message:
          input.action === 'dismiss'
            ? 'Report dismissed.'
            : input.suspend
              ? 'Vacancy closed and company suspended.'
              : 'Vacancy closed.',
        tone: 'success',
      })
      onClose()
    },
    onError: (error) => {
      const fields = serverFieldErrors(error)
      if (fields.reason || fields.note) setReasonError(fields.reason ?? fields.note)
      else if (error instanceof ApiError && error.status === 409) {
        setFailure(`${error.message} The list will show the latest state.`)
        void queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
      } else if (error instanceof ApiError && error.status < 500 && error.status !== 0) {
        setFailure(error.message)
      } else {
        toast.show({ message: 'Something went wrong. Please try again.', tone: 'error' })
      }
    },
  })

  if (!report)
    return (
      <Modal open={false} onClose={onClose} title="Review report">
        {null}
      </Modal>
    )

  const open = report.status === 'open'
  const canSuspend = report.vacancy.employer_status === 'approved'

  function act() {
    setFailure(null)
    setReasonError(undefined)
    if (suspend && !reason.trim()) {
      setReasonError('Give a reason. The employer will see it.')
      return
    }
    resolve.mutate({ action: 'action', suspend })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Review report"
      footer={
        open ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={resolve.isPending}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => resolve.mutate({ action: 'dismiss', suspend: false })}
              disabled={resolve.isPending}
            >
              Dismiss report
            </Button>
            <Button variant="danger" onClick={act} loading={resolve.isPending}>
              {report.vacancy.status === 'closed' ? 'Mark as actioned' : 'Close vacancy'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="space-y-3">
        {failure && <Alert>{failure}</Alert>}
        <div className="space-y-1.5 rounded-card border border-border bg-surface p-3">
          <p className="font-semibold">{report.vacancy.title}</p>
          <p className="text-sm text-text-secondary">
            {report.vacancy.company_name} ·{' '}
            {report.vacancy.is_live
              ? 'Live'
              : report.vacancy.status === 'closed'
                ? 'Closed'
                : report.vacancy.status === 'draft'
                  ? 'Draft'
                  : 'Expired'}
            {report.vacancy.is_live && (
              <>
                {' · '}
                <a
                  href={`/jobs/${report.vacancy.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Open the public page
                </a>
              </>
            )}
          </p>
          {report.vacancy.description && (
            <p className="text-sm break-words whitespace-pre-line">{report.vacancy.description}</p>
          )}
        </div>
        <p className="rounded-card bg-surface px-3 py-2 text-sm break-words">
          <strong>{REASON_LABELS[report.reason]}</strong>
          {report.details && <> · “{report.details}”</>}
          {report.reporter_email && (
            <span className="block text-text-secondary">{report.reporter_email}</span>
          )}
        </p>
        {!open && (
          <p className="text-sm text-text-secondary">
            This report was {report.status}
            {report.handled_at && ` on ${formatDate(report.handled_at)}`}.
          </p>
        )}
        {open && (
          <>
            <Checkbox
              label={`Also suspend ${report.vacancy.company_name}`}
              hint={
                canSuspend
                  ? 'They cannot publish new vacancies until you approve them again.'
                  : 'Only an approved company can be suspended.'
              }
              checked={suspend && canSuspend}
              disabled={!canSuspend}
              onChange={(event) => setSuspend(event.target.checked)}
            />
            {suspend && canSuspend && (
              <TextArea
                label="Reason (the employer will see it)"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setReasonError(undefined)
                }}
                error={reasonError}
              />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
