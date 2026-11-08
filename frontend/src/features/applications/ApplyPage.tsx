import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError, type ApplicationDetail } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { buttonClasses } from '../../components/buttonStyles'
import { Card } from '../../components/Card'
import { Checkbox } from '../../components/Checkbox'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { TextArea } from '../../components/TextArea'
import { cn } from '../../lib/cn'
import { useAuth } from '../auth/authContext'
import { useConsents, useSetConsent } from '../consent/useConsents'
import { useCv } from '../cv/useCvData'
import { useProfile } from '../profile/useProfileData'
import { useVacancy } from '../vacancies/useVacancies'
import { useApply, useMyApplicationFor } from './useApplications'

const COVER_NOTE_MAX = 2000

const formSchema = z.object({
  cover_note: z.string().max(COVER_NOTE_MAX, `Use at most ${COVER_NOTE_MAX} characters`),
  share: z.boolean(),
})
type FormValues = z.infer<typeof formSchema>

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function Step({ done, title, children }: { done: boolean; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3 py-2">
      <span
        aria-hidden="true"
        className={cn('mt-0.5 font-semibold', done ? 'text-success' : 'text-danger')}
      >
        {done ? '✓' : '!'}
      </span>
      <div className="min-w-0">
        <p className="font-semibold">
          {title}
          <span className="sr-only">{done ? ': done' : ': needs your attention'}</span>
        </p>
        {children && <p className="text-sm break-words text-text-secondary">{children}</p>}
      </div>
    </li>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'profile_required':
        return 'Complete your profile first.'
      case 'cv_required':
        return 'Upload your CV first.'
      case 'consent_required':
        return 'Agree to share your CV with employers first.'
      case 'email_not_verified':
        return 'Confirm your email address first.'
      case 'external_application':
        return 'This employer takes applications on its own website.'
      case 'vacancy_not_found':
        return 'This vacancy is no longer available.'
      default:
        return error.message
    }
  }
  return 'We could not send your application. Check your connection and try again.'
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-title-md font-semibold">{title}</h1>
      {subtitle && <p className="text-text-secondary">{subtitle}</p>}
    </div>
  )
}

function Sent({ application }: { application: ApplicationDetail }) {
  return (
    <section aria-labelledby="sent-title" className="space-y-4 pt-8 text-center">
      <span
        aria-hidden="true"
        className="inline-flex size-14 items-center justify-center rounded-pill border-2 border-success bg-success-tint text-2xl text-success"
      >
        ✓
      </span>
      <h1 id="sent-title" className="text-title-md font-semibold">
        Application sent
      </h1>
      <p className="text-text-secondary">
        {application.vacancy.title} at {application.vacancy.company_name}. We will show you here
        when the employer reviews it.
      </p>
      <div className="space-y-2">
        <Link to={`/applications/${application.id}`} className={buttonClasses({ fullWidth: true })}>
          See my application
        </Link>
        <Link to="/jobs" className={buttonClasses({ variant: 'ghost', fullWidth: true })}>
          Find more jobs
        </Link>
      </div>
    </section>
  )
}

/** Apply to a vacancy (mockup S7). The server decides; this page explains what is missing. */
export function ApplyPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const vacancy = useVacancy(id)
  const existing = useMyApplicationFor(id, true)
  const profile = useProfile()
  const cv = useCv()
  const consents = useConsents()
  const apply = useApply(id)
  const setConsent = useSetConsent()
  const [sent, setSent] = useState<ApplicationDetail | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { cover_note: '', share: false },
  })
  const note = useWatch({ control: form.control, name: 'cover_note' })
  const sharing = useWatch({ control: form.control, name: 'share' })

  const back = (
    <Link to={`/jobs/${id}`} className="text-sm text-primary underline">
      ‹ Back to the vacancy
    </Link>
  )

  if (sent) return <Sent application={sent} />

  if (vacancy.isError) {
    const gone = vacancy.error instanceof ApiError && vacancy.error.status === 404
    return gone ? (
      <section className="space-y-3">
        <h1 className="text-title-md font-semibold">This vacancy is no longer available</h1>
        <p className="text-text-secondary">It may have closed or reached its closing date.</p>
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

  const loading =
    vacancy.isPending ||
    existing.isPending ||
    profile.isPending ||
    cv.isPending ||
    consents.isPending
  if (loading) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-8 w-2/5" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const failed = [existing, profile, cv, consents].find((query) => query.isError)
  if (failed) {
    return (
      <ErrorState
        title="Could not load this page"
        message="We could not reach the server. Check your connection and try again."
        retrying={failed.isFetching}
        onRetry={() => void failed.refetch()}
      />
    )
  }

  const data = vacancy.data
  const subtitle = `${data.title} · ${data.employer.company_name}`

  if (existing.data) {
    return (
      <section className="space-y-4">
        {back}
        <Heading title="Apply" subtitle={subtitle} />
        <Alert tone="info">
          <strong>You have already applied for this vacancy.</strong>{' '}
          <Link to={`/applications/${existing.data.id}`} className="underline">
            See your application
          </Link>
        </Alert>
      </section>
    )
  }

  if (data.application_method === 'external') {
    return (
      <section className="space-y-4">
        {back}
        <Heading title="Apply" subtitle={subtitle} />
        <Alert tone="info">
          <strong>This employer takes applications on its own website.</strong> They are not tracked
          here.
        </Alert>
      </section>
    )
  }

  const emailOk = Boolean(user?.email_verified)
  const profileData = profile.data ?? null
  const cvData = cv.data ?? null
  const alreadyShared = (consents.data ?? []).some(
    (item) => item.consent_type === 'cv_sharing_with_employers',
  )
  const ready = emailOk && profileData !== null && cvData !== null

  const submit = form.handleSubmit(async (values) => {
    setProblem(null)
    try {
      if (!alreadyShared)
        await setConsent.mutateAsync({ type: 'cv_sharing_with_employers', granted: true })
      setSent(await apply.mutateAsync({ cover_note: values.cover_note.trim() || null }))
    } catch (error) {
      if (error instanceof ApiError && error.code === 'already_applied') {
        void existing.refetch()
        return
      }
      setProblem(errorMessage(error))
    }
  })

  const needsConsent = !alreadyShared && !sharing
  const reason = !emailOk
    ? 'Confirm your email address to apply.'
    : !profileData || !cvData
      ? 'Finish the steps above to apply.'
      : needsConsent
        ? 'Tick the box above to agree to share your profile and CV.'
        : null

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-label="Apply">
      {back}
      <Heading title="Apply" subtitle={subtitle} />

      {!emailOk && (
        <Alert tone="info">
          <strong>Confirm your email address first.</strong> We sent you a link. Check your inbox,
          then come back.
        </Alert>
      )}

      <Card>
        <h2 className="mb-1 text-title-sm font-semibold">
          {ready ? 'What will be sent' : 'Before you can apply'}
        </h2>
        <ul className="divide-y divide-border">
          <Step
            done={profileData !== null}
            title={profileData ? 'Your profile' : 'Complete your profile'}
          >
            {profileData ? (
              <>
                {profileData.full_name} · {profileData.skills.length}{' '}
                {profileData.skills.length === 1 ? 'skill' : 'skills'} ·{' '}
                {profileData.experiences.length}{' '}
                {profileData.experiences.length === 1 ? 'experience' : 'experiences'}.{' '}
                <Link to="/profile" className="underline">
                  Review
                </Link>
              </>
            ) : (
              <>
                Employers need to know who you are.{' '}
                <Link to="/profile" className="underline">
                  Complete your profile
                </Link>
              </>
            )}
          </Step>
          <Step done={cvData !== null} title={cvData ? 'Your CV' : 'Upload your CV'}>
            {cvData ? (
              <>
                {cvData.original_filename} ({formatSize(cvData.size_bytes)}). A copy is sent;
                changing your CV later does not change it.
              </>
            ) : (
              <>
                PDF or Word, up to 5 MB.{' '}
                <Link to="/profile" className="underline">
                  Upload your CV
                </Link>
              </>
            )}
          </Step>
          <Step
            done={emailOk}
            title={emailOk ? 'Your email address' : 'Confirm your email address'}
          >
            {emailOk ? `${user?.email}, so the employer can reply.` : undefined}
          </Step>
        </ul>
      </Card>

      <TextArea
        label="Cover note (optional)"
        rows={5}
        hint={`${note.length} / ${COVER_NOTE_MAX}`}
        error={form.formState.errors.cover_note?.message}
        {...form.register('cover_note')}
      />

      {!alreadyShared && (
        <Checkbox
          label="I agree that this employer may see my profile and CV. I can withdraw my application later."
          {...form.register('share')}
        />
      )}

      {problem && <Alert tone="danger">{problem}</Alert>}

      <div>
        <Button
          type="submit"
          fullWidth
          loading={apply.isPending || setConsent.isPending}
          aria-disabled={reason ? true : undefined}
          aria-describedby={reason ? 'apply-reason' : undefined}
          onClick={(event) => {
            if (reason) event.preventDefault()
          }}
          className={cn(
            reason &&
              'cursor-not-allowed border-border bg-surface text-text-secondary hover:bg-surface',
          )}
        >
          Send application
        </Button>
        {reason && (
          <p id="apply-reason" className="mt-1.5 text-center text-sm text-text-secondary">
            {reason}
          </p>
        )}
      </div>
    </form>
  )
}
