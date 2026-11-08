import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { apiError, loggedIn, loggedOut, makeUser, mockApi, renderWithAuth } from '../test/utils'
import { AppHeader } from './AppHeader'

const LOGOUT = 'POST /api/v1/auth/logout'

function renderHeader(route = '/account') {
  return renderWithAuth(
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<p>Home page</p>} />
        <Route path="/account" element={<p>Account page</p>} />
      </Routes>
    </>,
    { route },
  )
}

afterEach(() => {
  document.cookie = 'djm_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('AppHeader when logged out', () => {
  it('shows Log in and Register, and no account menu', async () => {
    mockApi({ ...loggedOut })
    renderHeader('/')

    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register')
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
  })

  it('names the brand link for screen readers', async () => {
    mockApi({ ...loggedOut })
    renderHeader('/')

    expect(
      await screen.findByRole('link', { name: 'Digital Job Matching System' }),
    ).toHaveAttribute('href', '/')
  })

  it('does not flash the logged-out links while the session is being checked', () => {
    mockApi({ 'GET /api/v1/auth/me': () => new Promise<Response>(() => {}) })
    renderHeader('/')

    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  })
})

describe('AppHeader profile link', () => {
  it('shows My profile to job seekers only', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'job_seeker' })) })
    const seeker = renderHeader()

    expect(await screen.findByRole('link', { name: 'My profile' })).toHaveAttribute(
      'href',
      '/profile',
    )
    seeker.unmount()

    mockApi({ ...loggedIn(makeUser({ role: 'employer' })) })
    renderHeader()
    await screen.findByRole('button', { name: 'Account menu' })
    expect(screen.queryByRole('link', { name: 'My profile' })).not.toBeInTheDocument()
  })
})

describe('AppHeader role links', () => {
  it('shows My company to employers only', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'employer' })) })
    const employer = renderHeader()

    expect(await screen.findByRole('link', { name: 'My company' })).toHaveAttribute(
      'href',
      '/employer',
    )
    expect(screen.queryByRole('link', { name: 'Employers' })).not.toBeInTheDocument()
    employer.unmount()

    for (const role of ['job_seeker', 'admin'] as const) {
      mockApi({ ...loggedIn(makeUser({ role })) })
      const view = renderHeader()
      await screen.findByRole('button', { name: 'Account menu' })
      expect(screen.queryByRole('link', { name: 'My company' })).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it('shows Employers to admins only', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'admin' })) })
    const admin = renderHeader()

    expect(await screen.findByRole('link', { name: 'Employers' })).toHaveAttribute(
      'href',
      '/admin/employers',
    )
    admin.unmount()

    for (const role of ['job_seeker', 'employer'] as const) {
      mockApi({ ...loggedIn(makeUser({ role })) })
      const view = renderHeader()
      await screen.findByRole('button', { name: 'Account menu' })
      expect(screen.queryByRole('link', { name: 'Employers' })).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it('shows Reports to admins only', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'admin' })) })
    const admin = renderHeader()

    expect(await screen.findByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/admin/reports',
    )
    admin.unmount()

    for (const role of ['job_seeker', 'employer'] as const) {
      mockApi({ ...loggedIn(makeUser({ role })) })
      const view = renderHeader()
      await screen.findByRole('button', { name: 'Account menu' })
      expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it('puts the role link in the phone menu too', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'employer' })) })
    renderHeader()

    await userEvent.click(await screen.findByRole('button', { name: 'Menu' }))

    const menu = screen.getByRole('navigation', { name: 'Menu' })
    expect(within(menu).getByRole('link', { name: 'My company' })).toHaveAttribute(
      'href',
      '/employer',
    )
  })
})

describe('AppHeader when logged in', () => {
  it('shows the user menu with email, role and verification status', async () => {
    mockApi({ ...loggedIn(makeUser({ email_verified: false, role: 'employer' })) })
    renderHeader()

    const button = await screen.findByRole('button', { name: 'Account menu' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Employer · email not verified/)).toBeInTheDocument()
    const menu = document.getElementById('user-menu') as HTMLElement
    expect(within(menu).getByRole('link', { name: 'My account' })).toHaveAttribute(
      'href',
      '/account',
    )
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
  })

  it('logs out with the CSRF header, clears the user and goes home', async () => {
    document.cookie = 'djm_csrf=csrf-token-123'
    const api = mockApi({
      ...loggedIn(),
      [LOGOUT]: () => new Response(null, { status: 204 }),
    })
    renderHeader()

    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/logout')[0].headers['X-CSRF-Token']).toBe(
      'csrf-token-123',
    )
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument()
  })

  it('treats a 401 on logout as already logged out', async () => {
    mockApi({
      ...loggedIn(),
      [LOGOUT]: () => apiError(401, 'not_authenticated', 'Please log in to continue.'),
    })
    renderHeader()

    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('link', { name: 'Log in' })).toBeInTheDocument()
  })

  it('stays logged in and shows a toast when the server cannot be reached', async () => {
    mockApi({
      ...loggedIn(),
      [LOGOUT]: () => {
        throw new TypeError('Failed to fetch')
      },
    })
    renderHeader()

    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByText(/Could not log you out/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument()
  })

  it('closes the menu with Escape and returns focus to its button', async () => {
    mockApi({ ...loggedIn() })
    renderHeader()
    const button = await screen.findByRole('button', { name: 'Account menu' })
    await userEvent.click(button)
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes the menu when clicking elsewhere', async () => {
    mockApi({ ...loggedIn() })
    renderHeader()
    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }))

    await userEvent.click(screen.getByText('Account page'))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument(),
    )
  })

  it('has a phone menu with links and Log out', async () => {
    mockApi({
      ...loggedIn(),
      [LOGOUT]: () => new Response(null, { status: 204 }),
    })
    renderHeader('/account')
    const menuButton = await screen.findByRole('button', { name: 'Menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(menuButton)

    const menu = screen.getByRole('navigation', { name: 'Menu' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(menu).toHaveTextContent('nakato@example.com · Job seeker')
    expect(screen.getAllByRole('link', { name: 'Find jobs' }).length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })
})
