import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { applicationCvUrl } from '../../api/applications'
import { applicantPhotoUrl } from '../../api/pictures'
import { ApiError, type ApplicationStatus } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { buttonClasses } from '../../components/buttonStyles'
import { Card } from '../../components/Card'
import { CompanyAvatar } from '../../components/CompanyAvatar'
import { ErrorState } from '../../components/ErrorState'
import { Skeleton } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { StatusTimeline } from '../../components/StatusTimeline'
import { TextArea } from '../../components/TextArea'
import { useToast } from '../../components/toastContext'
import { APPLICATION_STATUS_LABELS } from '../../lib/applicationStatus'
import { formatDate, formatDateTime } from '../../lib/dates'
import { useApplication, useChangeStatus } from './useApplications'

const NOTE_MAX = 1000

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function Row({ label, children }: { label: string; children: string | null }) {
  if (!children) return null
  return (
    <div>
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="font-semibold break-words">{children}</dd>
    </div>
  )
}

/** One applicant, as the employer sees them (mockup S11): profile, CV, history and the status. */
export function ApplicantDetailPage() {
  const { id = '' } = useParams()
  const application = useApplication(id)
  const change = useChangeStatus(id)
  const toast = useToast()
  const [chosen, setChosen] = useState<ApplicationStatus | null>(null)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  if (application.isPending) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading the applicant</span>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (application.isError) {
    const missing = application.error instanceof ApiError && application.error.status === 404
    return missing ? (
      <section className="space-y-3">
        <h1 className="text-title-md font-semibold">We could not find this application</h1>
        <p className="text-text-secondary">It may belong to another company, or no longer exist.</p>
        <Link to="/employer" className={buttonClasses()}>
          Back to my vacancies
        </Link>
      </section>
    ) : (
      <ErrorState
        title="Could not load this applicant"
        message="We could not reach the server. Check your connection and try again."
        retrying={application.isFetching}
        onRetry={() => void application.refetch()}
      />
    )
  }

  const data = application.data
  const profile = data.profile
  const noteTooLong = note.length > NOTE_MAX
  const entries = [...data.history].reverse().map((item) => ({
    status: item.to_status,
    at: item.created_at,
    note: item.note ?? undefined,
  }))

  function update() {
    if (!chosen || noteTooLong) return
    setProblem(null)
    change.mutate(
      { status: chosen, note: note.trim() || null },
      {
        onSuccess: (saved) => {
          setChosen(null)
          setNote('')
          toast.show({
            message: `Moved to ${APPLICATION_STATUS_LABELS[saved.status]}.`,
            tone: 'success',
          })
        },
        onError: (error) => {
          setProblem(
            error instanceof ApiError
              ? error.message
              : 'We could not update the status. Please try again.',
          )
        },
      },
    )
  }

  return (
    <article aria-labelledby="applicant-title" className="space-y-5 pb-4">
      <Link
        to={`/employer/vacancies/${data.vacancy.id}/applicants`}
        className="text-sm text-primary underline"
      >
        ‹ All applicants
      </Link>

      <header className="space-y-1">
        <CompanyAvatar
          name={profile.full_name}
          imageUrl={applicantPhotoUrl(data.id)}
          size="lg"
          round
        />
        <h1 id="applicant-title" className="text-title-md font-semibold">
          {profile.full_name}
        </h1>
        <p className="text-text-secondary">Applied for {data.vacancy.title}</p>
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge status={data.status} />
          <span className="text-sm text-text-secondary">
            Applied {formatDate(data.submitted_at)}
          </span>
        </p>
      </header>

      <Card className="space-y-3">
        <h2 className="text-title-sm font-semibold">Contact</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Row label="Email">{data.applicant_email}</Row>
          <Row label="Phone">{profile.phone}</Row>
          <Row label="District">{profile.district}</Row>
        </dl>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-title-sm font-semibold">Profile when they applied</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Row label="Institution">{profile.institution}</Row>
          <Row label="Qualification">{profile.qualification}</Row>
          <Row label="Field of study">{profile.field_of_study}</Row>
          <Row label={profile.study_status === 'studying' ? 'Expected to finish' : 'Graduated'}>
            {profile.study_status === 'studying'
              ? profile.expected_completion_date && formatDate(profile.expected_completion_date)
              : profile.graduation_date && formatDate(profile.graduation_date)}
          </Row>
        </dl>
        {profile.summary && <p className="break-words whitespace-pre-line">{profile.summary}</p>}
        {profile.skills.length > 0 && (
          <div>
            <h3 className="text-sm text-text-secondary">Skills</h3>
            <ul className="mt-1 flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <li key={skill} className="rounded-pill border border-border px-3 py-1 text-sm">
                  {skill}
                </li>
              ))}
            </ul>
          </div>
        )}
        {profile.experiences.length > 0 && (
          <div>
            <h3 className="text-sm text-text-secondary">Experience</h3>
            <ul className="mt-1 space-y-2">
              {profile.experiences.map((item) => (
                <li key={`${item.title}-${item.start_date}`}>
                  <p className="font-semibold">
                    {item.title}, {item.organisation}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {formatDate(item.start_date)} –{' '}
                    {item.end_date ? formatDate(item.end_date) : 'now'}
                  </p>
                  {item.description && (
                    <p className="break-words whitespace-pre-line">{item.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-title-sm font-semibold">Cover note and CV</h2>
        {data.cover_note ? (
          <p className="break-words whitespace-pre-line">{data.cover_note}</p>
        ) : (
          <p className="text-text-secondary">No cover note.</p>
        )}
        <a
          href={applicationCvUrl(data.id)}
          download
          className={buttonClasses({ variant: 'secondary', fullWidth: true })}
        >
          Download CV ({data.cv.original_filename}, {formatSize(data.cv.size_bytes)})
        </a>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-title-sm font-semibold">Status</h2>
        {data.next_statuses.length === 0 ? (
          <p className="text-text-secondary">
            This application is {APPLICATION_STATUS_LABELS[data.status].toLowerCase()}. It cannot be
            changed any more.
          </p>
        ) : (
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm text-text-secondary">Move this application to</legend>
            <div className="flex flex-wrap gap-2">
              {data.next_statuses.map((status) => (
                <label
                  key={status}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-card border border-text-secondary px-3 has-checked:border-2 has-checked:border-primary has-checked:bg-primary-tint has-checked:font-semibold"
                >
                  <input
                    type="radio"
                    name="next-status"
                    value={status}
                    checked={chosen === status}
                    onChange={() => setChosen(status)}
                    className="accent-primary"
                  />
                  {APPLICATION_STATUS_LABELS[status]}
                </label>
              ))}
            </div>
            <TextArea
              label="Note (optional)"
              hint="The applicant can read this note."
              rows={3}
              value={note}
              error={noteTooLong ? `Use at most ${NOTE_MAX} characters` : undefined}
              onChange={(event) => setNote(event.target.value)}
            />
            {problem && <Alert tone="danger">{problem}</Alert>}
            <Button
              fullWidth
              loading={change.isPending}
              disabled={!chosen || noteTooLong}
              onClick={update}
            >
              Update status
            </Button>
          </fieldset>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-title-sm font-semibold">History</h2>
        <StatusTimeline entries={entries} />
        <p className="mt-2 text-sm text-text-secondary">
          Last change {formatDateTime(data.updated_at)}
        </p>
      </Card>
    </article>
  )
}
