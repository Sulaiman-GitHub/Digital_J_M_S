import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { reportVacancy } from '../../api/reports'
import { ApiError, type ReportReason } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { TextArea } from '../../components/TextArea'
import { useToast } from '../../components/toastContext'
import { serverFieldErrors } from '../../lib/formErrors'
import { useAuth } from '../auth/authContext'
import { DETAILS_MAX, REPORT_REASONS } from './reportReasons'

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return 'You have sent a lot of reports. Please wait a while and try again.'
    if (error.status === 404) return 'This vacancy is no longer available.'
    if (error.status === 409 && error.code === 'cannot_report_own_vacancy') {
      return 'You cannot report your own vacancy.'
    }
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

/**
 * "Report this vacancy" (mockup S13). Anonymous visitors are sent to log in first. After a report
 * the control says so, and a second report of the same vacancy is not offered.
 */
export function ReportVacancy({ vacancyId }: { vacancyId: string }) {
  const { user, status } = useAuth()
  const location = useLocation()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reported, setReported] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: () =>
      reportVacancy(vacancyId, { reason: reason as ReportReason, details: details.trim() || null }),
    onSuccess: () => {
      setOpen(false)
      setReported(true)
      toast.show({ message: 'Thank you. We will look at it.', tone: 'success' })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409 && error.code === 'already_reported') {
        setOpen(false)
        setReported(true)
        return
      }
      const fields = serverFieldErrors(error)
      if (fields.details) setFieldError(fields.details)
      else setProblem(messageFor(error))
    },
  })

  function openDialog() {
    setReason(null)
    setDetails('')
    setProblem(null)
    setFieldError(null)
    setOpen(true)
  }

  function submit() {
    setProblem(null)
    setFieldError(null)
    if (!reason) {
      setProblem('Choose what is wrong.')
      return
    }
    if (reason === 'other' && !details.trim()) {
      setFieldError('Tell us what is wrong.')
      return
    }
    send.mutate()
  }

  if (reported) {
    return (
      <p className="text-sm text-text-secondary">
        <span aria-hidden="true">✓ </span>You reported this vacancy. Thank you, we will look at it.
      </p>
    )
  }

  if (status !== 'loading' && !user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return (
      <p className="text-sm">
        <Link to={`/login?next=${next}`} className="text-text-secondary underline">
          Log in to report this vacancy
        </Link>
      </p>
    )
  }
  if (!user) return null

  return (
    <>
      <p className="text-sm">
        <button
          type="button"
          onClick={openDialog}
          className="min-h-11 cursor-pointer text-text-secondary underline"
        >
          Report this vacancy
        </button>
      </p>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Report this vacancy"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={send.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={send.isPending}>
              Send report
            </Button>
          </>
        }
      >
        <p className="mb-3 text-text-secondary">
          Tell us what is wrong. We read every report. The employer is not told who reported.
        </p>
        {problem && <Alert className="mb-3">{problem}</Alert>}
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-semibold">What is the problem?</legend>
          {REPORT_REASONS.map((item) => (
            <label
              key={item.value}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-card border border-text-secondary px-3 has-checked:border-2 has-checked:border-primary has-checked:bg-primary-tint"
            >
              <input
                type="radio"
                name="report-reason"
                value={item.value}
                checked={reason === item.value}
                onChange={() => setReason(item.value)}
                className="size-4.5 accent-primary"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
        <TextArea
          className="mt-3"
          label={reason === 'other' ? 'Details' : 'Details (optional)'}
          maxLength={DETAILS_MAX}
          value={details}
          onChange={(event) => {
            setDetails(event.target.value)
            setFieldError(null)
          }}
          error={fieldError ?? undefined}
        />
      </Modal>
    </>
  )
}
