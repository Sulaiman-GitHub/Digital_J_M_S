import type { UserRole } from '../api/types'

export const ROLE_LABELS: Record<UserRole, string> = {
  job_seeker: 'Job seeker',
  employer: 'Employer',
  admin: 'Admin',
}

/** Where each kind of user lands after logging in. */
export const HOME_PATH: Record<UserRole, string> = {
  job_seeker: '/account',
  employer: '/employer',
  admin: '/admin/employers',
}
