import { Link } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { buttonClasses } from '../../components/buttonStyles'
import { Card } from '../../components/Card'
import { formatDate } from '../../lib/dates'
import { ROLE_LABELS } from '../../lib/roles'
import { useAuth } from '../auth/authContext'
import { savedPercent } from '../profile/schema'
import { useProfile } from '../profile/useProfileData'
import { YourData } from './YourData'

/** Placeholder landing page after login, until the real dashboards exist (Modules 2.3 and 3.3). */
export function AccountPage() {
  const { user } = useAuth()
  const isSeeker = user?.role === 'job_seeker'
  const profile = useProfile(isSeeker)
  if (!user) return null

  const percent = savedPercent(profile.data ?? null)

  return (
    <section aria-labelledby="account-title" className="space-y-4">
      <h1 id="account-title" className="text-title-md font-semibold">
        My account
      </h1>

      {isSeeker && !profile.isPending && !profile.isError && (
        <Card aria-labelledby="profile-prompt-title" className="max-w-md space-y-2">
          <h2 id="profile-prompt-title" className="font-semibold">
            {profile.data
              ? percent < 100
                ? `Your profile is ${percent}% complete`
                : 'Your profile is complete'
              : 'Complete your profile'}
          </h2>
          <p className="text-text-secondary">
            {profile.data
              ? 'Employers see your profile when you apply.'
              : 'Employers see your profile when you apply. It takes about 5 minutes.'}
          </p>
          <Link
            to="/profile"
            className={buttonClasses({
              variant: profile.data && percent === 100 ? 'secondary' : 'primary',
            })}
          >
            {profile.data ? 'Edit my profile' : 'Start my profile'}
          </Link>
        </Card>
      )}

      <Card as="dl" className="grid max-w-md gap-3">
        <div>
          <dt className="text-sm text-text-secondary">Email</dt>
          <dd className="font-semibold">{user.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-secondary">Account type</dt>
          <dd className="font-semibold">{ROLE_LABELS[user.role]}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-secondary">Email status</dt>
          <dd>
            {user.email_verified ? (
              <Badge tone="success">Verified</Badge>
            ) : (
              <Badge tone="warning">Not verified</Badge>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-text-secondary">Member since</dt>
          <dd className="font-semibold">{formatDate(user.created_at)}</dd>
        </div>
      </Card>

      {user.role !== 'admin' && <YourData />}
    </section>
  )
}
