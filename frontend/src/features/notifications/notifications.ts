import type { ApplicationItem, Profile } from '../../api/types'
import { APPLICATION_STATUS_LABELS } from '../../lib/applicationStatus'

export interface AppNotification {
  id: string
  title: string
  detail: string
  to: string
  /** When it happened. Tasks (things still to do) have none and always count as unread. */
  at: string | null
}

export interface NotificationInput {
  applications: ApplicationItem[]
  /** undefined while loading, null when the seeker has no profile yet. */
  profile: Profile | null | undefined
  emailVerified: boolean
}

/**
 * What a job seeker should hear about, worked out from data we already have:
 * employer decisions on their applications, and unfinished set-up. Newest first, tasks last.
 */
export function buildNotifications({
  applications,
  profile,
  emailVerified,
}: NotificationInput): AppNotification[] {
  const updates: AppNotification[] = applications
    // "Submitted" is the applicant's own action; every later status came from the employer.
    .filter((application) => application.status !== 'submitted')
    .map((application) => ({
      id: `application:${application.id}:${application.status}`,
      title: `${application.vacancy.company_name}: ${APPLICATION_STATUS_LABELS[application.status]}`,
      detail: `Your application for ${application.vacancy.title} is now “${APPLICATION_STATUS_LABELS[application.status]}”.`,
      to: `/applications/${application.id}`,
      at: application.updated_at,
    }))
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

  const tasks: AppNotification[] = []
  if (!emailVerified) {
    tasks.push({
      id: 'task:verify-email',
      title: 'Verify your email',
      detail: 'You need a verified email before you can apply for jobs.',
      to: '/account',
      at: null,
    })
  }
  if (profile === null) {
    tasks.push({
      id: 'task:create-profile',
      title: 'Create your profile',
      detail: 'Employers see your profile when you apply. It takes about 5 minutes.',
      to: '/profile',
      at: null,
    })
  }
  return [...updates, ...tasks]
}

export function unreadCount(items: AppNotification[], seenAt: string | null): number {
  return items.filter((item) => item.at === null || seenAt === null || item.at > seenAt).length
}

const KEY_PREFIX = 'djm-notifications-seen:'

export function readSeenAt(userId: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + userId)
  } catch {
    return null
  }
}

export function writeSeenAt(userId: string, iso: string) {
  try {
    localStorage.setItem(KEY_PREFIX + userId, iso)
  } catch {
    // Storage blocked: the badge simply comes back next visit.
  }
}
