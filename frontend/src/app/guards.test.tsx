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
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from './guards'

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
})
