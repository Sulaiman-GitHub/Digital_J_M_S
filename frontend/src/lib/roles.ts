import type { UserRole } from '../api/types'
import { safeNextPath } from './safeRedirect'

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

interface PathRule {
  test: (path: string) => boolean
  role: UserRole
}

/** True when path is the prefix itself or sits under it, on whole segments (so /admin does not match /administrators). */
function under(prefix: string) {
  return (path: string) => path === prefix || path.startsWith(`${prefix}/`)
}

/** Which role may open which path. A path that matches no rule is open to everyone. */
const PATH_RULES: PathRule[] = [
  { test: under('/employer'), role: 'employer' },
  { test: under('/admin'), role: 'admin' },
  { test: under('/profile'), role: 'job_seeker' },
  { test: under('/saved'), role: 'job_seeker' },
  { test: under('/applications'), role: 'job_seeker' },
  { test: (path) => /^\/jobs\/[^/]+\/apply$/.test(path), role: 'job_seeker' },
]

/** The path only: no query string, no hash, no trailing slash. */
function pathOnly(path: string): string {
  const bare = path.split(/[?#]/, 1)[0]
  return bare.length > 1 ? bare.replace(/\/+$/, '') : bare
}

export function canRoleOpen(role: UserRole, path: string): boolean {
  const bare = pathOnly(path)
  const rule = PATH_RULES.find((item) => item.test(bare))
  return !rule || rule.role === role
}

/** Where to send a user after login: the requested page if it is safe and their role may open it, else their home. */
export function nextPathForUser(next: string | null | undefined, role: UserRole): string {
  const safe = safeNextPath(next)
  return safe && canRoleOpen(role, safe) ? safe : HOME_PATH[role]
}
