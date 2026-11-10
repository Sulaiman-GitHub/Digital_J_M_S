import { Link } from 'react-router-dom'
import { applicantPhotoUrl } from '../../api/pictures'
import { Badge } from '../../components/Badge'
import { buttonClasses } from '../../components/buttonStyles'
import { CompanyAvatar } from '../../components/CompanyAvatar'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Skeleton } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { formatDate } from '../../lib/dates'
import { useApplication } from './useApplications'

/**
 * A pop-up preview of one applicant, so an employer can skim the people who applied without
 * leaving the list. The full page (status changes, CV, history) is one click further.
 */
export function ApplicantQuickView({
  applicationId,
  open,
  onClose,
}: {
  applicationId: string
  open: boolean
  onClose: () => void
}) {
  // Nothing is fetched until the pop-up is opened.
  const application = useApplication(applicationId, open)
  const data = application.data
  const profile = data?.profile

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={profile ? profile.full_name : 'Applicant'}
      footer={
        <>
          <Link
            to={`/employer/applications/${applicationId}`}
            className={buttonClasses({ variant: 'primary' })}
          >
            Open full application
          </Link>
        </>
      }
    >
      {application.isPending ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading the applicant</span>
          <Skeleton className="h-12 w-3/5" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : application.isError || !data || !profile ? (
        <ErrorState
          title="Could not load this applicant"
          message="Check your connection and try again."
          retrying={application.isFetching}
          onRetry={() => void application.refetch()}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CompanyAvatar
              name={profile.full_name}
              imageUrl={applicantPhotoUrl(applicationId)}
              round
            />
            <div className="min-w-0">
              <p className="font-semibold break-words">{profile.full_name}</p>
              <p className="text-sm text-text-secondary">
                {[profile.qualification, profile.institution].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="ml-auto">
              <StatusBadge status={data.status} />
            </span>
          </div>

          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-secondary">Field of study</dt>
              <dd className="font-semibold">{profile.field_of_study ?? 'Not given'}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">District</dt>
              <dd className="font-semibold">{profile.district ?? 'Not given'}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Applied</dt>
              <dd className="font-semibold">{formatDate(data.submitted_at)}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">CV</dt>
              <dd className="font-semibold">
                {data.cv ? data.cv.original_filename : 'None shared'}
              </dd>
            </div>
          </dl>

          {profile.skills.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Skills</h3>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {profile.skills.map((skill) => (
                  <li key={skill}>
                    <Badge tone="primary">{skill}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.summary && (
            <div>
              <h3 className="text-sm font-semibold">About</h3>
              <p className="mt-1 break-words whitespace-pre-line">{profile.summary}</p>
            </div>
          )}

          {data.cover_note && (
            <div>
              <h3 className="text-sm font-semibold">Cover note</h3>
              <p className="mt-1 break-words whitespace-pre-line">{data.cover_note}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
