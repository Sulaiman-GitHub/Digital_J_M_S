import type { UserRole } from '../api/types'

export const ROLE_LABELS: Record<UserRole, string> = {
  job_seeker: 'Job seeker',
  employer: 'Employer',
  admin: 'Admin',
}
