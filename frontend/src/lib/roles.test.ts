import { describe, expect, it } from 'vitest'
import type { UserRole } from '../api/types'
import { canRoleOpen, HOME_PATH, nextPathForUser } from './roles'

const ROLES: UserRole[] = ['job_seeker', 'employer', 'admin']

const OWNED: [string, UserRole][] = [
  ['/employer', 'employer'],
  ['/employer/vacancies/new', 'employer'],
  ['/employer/', 'employer'],
  ['/admin', 'admin'],
  ['/admin/reports', 'admin'],
  ['/profile', 'job_seeker'],
  ['/profile/education', 'job_seeker'],
  ['/saved', 'job_seeker'],
  ['/applications', 'job_seeker'],
  ['/applications/9', 'job_seeker'],
  ['/jobs/42/apply', 'job_seeker'],
]

const OPEN = ['/', '/account', '/jobs', '/jobs/42', '/terms', '/employers-info', '/administrators']

describe('canRoleOpen', () => {
  it.each(OWNED)('%s is only for %s', (path, owner) => {
    for (const role of ROLES) expect(canRoleOpen(role, path)).toBe(role === owner)
  })

  it.each(OPEN)('%s is open to every role', (path) => {
    for (const role of ROLES) expect(canRoleOpen(role, path)).toBe(true)
  })

  it('ignores the query string and hash', () => {
    expect(canRoleOpen('admin', '/employer?tab=1')).toBe(false)
    expect(canRoleOpen('employer', '/employer?tab=1#top')).toBe(true)
    expect(canRoleOpen('admin', '/jobs/42?next=/admin')).toBe(true)
    expect(canRoleOpen('employer', '/account?x=/employer')).toBe(true)
  })
})

describe('nextPathForUser', () => {
  it('keeps a permitted next path', () => {
    expect(nextPathForUser('/employer/vacancies/new?x=1', 'employer')).toBe(
      '/employer/vacancies/new?x=1',
    )
    expect(nextPathForUser('/jobs/42', 'job_seeker')).toBe('/jobs/42')
    expect(nextPathForUser('/jobs/42', 'admin')).toBe('/jobs/42')
  })

  it.each([
    ['/employer', 'admin'],
    ['/employer', 'job_seeker'],
    ['/admin/reports', 'job_seeker'],
    ['/admin/reports', 'employer'],
    ['/saved', 'employer'],
    ['/jobs/42/apply', 'admin'],
  ] as const)('sends %s to the home of a %s', (next, role) => {
    expect(nextPathForUser(next, role)).toBe(HOME_PATH[role])
  })

  it.each(ROLES)('falls back to home for a %s with no next', (role) => {
    expect(nextPathForUser(null, role)).toBe(HOME_PATH[role])
    expect(nextPathForUser(undefined, role)).toBe(HOME_PATH[role])
  })

  it.each(['//evil.example', 'https://evil.example', '/\\evil.example'])(
    'rejects unsafe %s',
    (next) => {
      for (const role of ROLES) expect(nextPathForUser(next, role)).toBe(HOME_PATH[role])
    },
  )
})
