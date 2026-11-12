import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  apiError,
  loggedIn,
  loggedOut,
  makeUser,
  ME,
  mockApi,
  okData,
  renderWithAuth,
} from '../test/utils'
import type { RouteObject } from 'react-router-dom'
import type { UserRole } from '../api/types'
import { canRoleOpen } from '../lib/roles'
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from './guards'
import { authRoutes } from './router'

function Where() {
  const location = useLocation()
  return (
    <p>
      Login page at {location.pathname}
      {location.search}
    </p>
  )
}

function renderRoutes(route: string) {
  return renderWithAuth(
    <Routes>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<Where />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/account" element={<p>Account page</p>} />
        <Route element={<RequireRole roles={['employer', 'admin']} />}>
          <Route path="/employer" element={<p>Employer page</p>} />
        </Route>
      </Route>
      <Route path="/admin/employers" element={<p>Admin home</p>} />
      <Route path="/jobs/:id" element={<p>Job page</p>} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>,
    { route },
  )
}

describe('RequireAuth', () => {
  it('sends a visitor to login and remembers the page (?next=)', async () => {
    mockApi({ ...loggedOut })
    renderRoutes('/account?tab=profile')

    expect(
      await screen.findByText('Login page at /login?next=%2Faccount%3Ftab%3Dprofile'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Account page')).not.toBeInTheDocument()
  })

  it('shows the page to a logged-in user', async () => {
    mockApi({ ...loggedIn() })
    renderRoutes('/account')

    expect(await screen.findByText('Account page')).toBeInTheDocument()
  })

  it('shows a loading state while the session is being checked', async () => {
    mockApi({ [ME]: () => new Promise<Response>(() => {}) })
    renderRoutes('/account')

    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Account page')).not.toBeInTheDocument()
  })

  it('shows an error with Retry when the session check fails, and recovers', async () => {
    let up = false
    mockApi({
      [ME]: () =>
        up ? okData(makeUser()) : apiError(500, 'internal_error', 'Something went wrong.'),
    })
    renderRoutes('/account')

    expect(await screen.findByText('Could not check your session')).toBeInTheDocument()
    expect(screen.queryByText('Login page at /login')).not.toBeInTheDocument()

    up = true
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Account page')).toBeInTheDocument()
  })
})

describe('RequireRole', () => {
  it('lets an allowed role in', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'employer' })) })
    renderRoutes('/employer')

    expect(await screen.findByText('Employer page')).toBeInTheDocument()
  })

  it('shows a no-permission page to other roles', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'job_seeker' })) })
    renderRoutes('/employer')

    expect(
      await screen.findByRole('heading', { name: 'You do not have permission to see this page' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Employer page')).not.toBeInTheDocument()
  })
})

describe('RedirectIfAuthenticated', () => {
  it('keeps logged-out visitors on the login page', async () => {
    mockApi({ ...loggedOut })
    renderRoutes('/login')

    expect(await screen.findByText('Login page at /login')).toBeInTheDocument()
  })

  it('sends a logged-in user to their account', async () => {
    mockApi({ ...loggedIn() })
    renderRoutes('/login')

    expect(await screen.findByText('Account page')).toBeInTheDocument()
  })

  it('honours a safe ?next= and ignores an unsafe one', async () => {
    mockApi({ ...loggedIn() })
    const first = renderRoutes('/login?next=%2Fjobs%2F7')
    expect(await screen.findByText('Job page')).toBeInTheDocument()
    first.unmount()

    renderRoutes(`/login?next=${encodeURIComponent('//evil.example')}`)
    expect(await screen.findByText('Account page')).toBeInTheDocument()
  })

  it.each([
    ['job_seeker', '/employer', 'Account page'],
    ['job_seeker', '/jobs/7', 'Job page'],
    ['employer', '/employer', 'Employer page'],
    ['employer', '/admin/reports', 'Employer page'],
    ['employer', undefined, 'Employer page'],
    ['admin', '/employer', 'Admin home'],
    ['admin', '/jobs/7', 'Job page'],
    ['admin', undefined, 'Admin home'],
  ] as const)('%s with next=%s lands on %s', async (role, next, page) => {
    mockApi({ ...loggedIn(makeUser({ role })) })
    renderRoutes(next ? `/login?next=${encodeURIComponent(next)}` : '/login')

    expect(await screen.findByText(page)).toBeInTheDocument()
  })
})

describe('ForbiddenPage', () => {
  it.each([
    ['job_seeker', '/employer', '/account'],
    ['admin', '/employer', '/admin/employers'],
  ] as const)('a %s who opens %s gets a link to their dashboard', async (role, visit, home) => {
    // The test router lets only employer/admin into /employer, so a job seeker is refused.
    // For the admin case we use a router that allows job seekers only.
    mockApi({ ...loggedIn(makeUser({ role })) })
    renderWithAuth(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route
            element={
              <RequireRole
                roles={['job_seeker', 'employer'].filter((r) => r !== role) as UserRole[]}
              />
            }
          >
            <Route path={visit} element={<p>Hidden page</p>} />
          </Route>
        </Route>
      </Routes>,
      { route: visit },
    )

    const link = await screen.findByRole('link', { name: 'Go to your dashboard' })
    expect(link).toHaveAttribute('href', home)
  })

  it('links an employer to their dashboard', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'employer' })) })
    renderWithAuth(
      <Routes>
        <Route element={<RequireAuth />}>
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/admin/reports" element={<p>Hidden page</p>} />
          </Route>
        </Route>
      </Routes>,
      { route: '/admin/reports' },
    )

    expect(await screen.findByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute(
      'href',
      '/employer',
    )
  })
})

describe('router RequireRole agrees with the path rules', () => {
  type Found = [string, readonly UserRole[] | null]

  function collect(routes: RouteObject[], roles: readonly UserRole[] | null, out: Found[]) {
    for (const route of routes) {
      let current = roles
      const element = route.element as
        { type?: unknown; props?: { roles?: UserRole[] } } | undefined
      if (element?.type === RequireRole) current = element.props?.roles ?? null
      if (route.path) out.push([route.path, current])
      if (route.children) collect(route.children, current, out)
    }
    return out
  }

  const everyRole: UserRole[] = ['job_seeker', 'employer', 'admin']
  const found = collect(authRoutes, null, []).filter(
    ([path]) => !/^\/(login|register|forgot-password|reset-password|verify-email)/.test(path),
  )

  it('finds the guarded routes', () => {
    expect(found.some(([, roles]) => roles !== null)).toBe(true)
  })

  it.each(found)('%s', (path, roles) => {
    const sample = path.replace(/\/:[^/]+/g, '/1').replace(/\/1\?/, '/1')
    for (const role of everyRole) {
      expect(canRoleOpen(role, sample)).toBe(roles ? roles.includes(role) : true)
    }
  })
})
