import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
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
} from '../../test/utils'
import { VerifyEmailPage } from './VerifyEmailPage'

const VERIFY = 'POST /api/v1/auth/verify-email'

function renderPage(route = '/verify-email?token=abc123') {
  return renderWithAuth(
    <Routes>
      <Route path="/verify-email" element={<VerifyEmailPage />} />
    </Routes>,
    { route },
  )
}

describe('VerifyEmailPage', () => {
  it('shows a status while checking the link, then success with a login link', async () => {
    let finish: (response: Response) => void = () => {}
    const api = mockApi({
      ...loggedOut,
      [VERIFY]: () => new Promise<Response>((resolve) => (finish = resolve)),
    })
    renderPage()

    expect(await screen.findByText('Confirming your email…')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/verify-email')[0].body).toEqual({ token: 'abc123' })

    finish(okData(makeUser({ email_verified: true })))

    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })

  it('sends the token only once', async () => {
    const api = mockApi({ ...loggedOut, [VERIFY]: () => okData(makeUser()) })
    renderPage()

    await screen.findByRole('heading', { name: 'Email confirmed' })

    expect(api.callsTo('POST', '/api/v1/auth/verify-email')).toHaveLength(1)
  })

  it('offers "Go to my account" and refreshes the user when already logged in', async () => {
    let verified = false
    const api = mockApi({
      [ME]: () => okData(makeUser({ email_verified: verified })),
      [VERIFY]: () => {
        verified = true
        return okData(makeUser({ email_verified: true }))
      },
    })
    renderPage()

    expect(await screen.findByRole('link', { name: 'Go to my account' })).toHaveAttribute(
      'href',
      '/account',
    )
    // The user is re-fetched so the "verify your email" banner disappears.
    await screen.findByRole('heading', { name: 'Email confirmed' })
    expect(api.callsTo('GET', '/api/v1/auth/me').length).toBeGreaterThanOrEqual(2)
  })

  it.each([
    ['token_expired', 'This link has expired'],
    ['token_used', 'This link was already used'],
    ['token_invalid', 'This link is not valid'],
  ])('explains a %s link', async (code, title) => {
    mockApi({ ...loggedOut, [VERIFY]: () => apiError(400, code, 'Server message.') })
    renderPage()

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument()
  })

  it('says the link is not valid when there is no token, without calling the API', async () => {
    const api = mockApi({ ...loggedIn() })
    renderPage('/verify-email')

    expect(
      await screen.findByRole('heading', { name: 'This link is not valid' }),
    ).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/verify-email')).toHaveLength(0)
  })

  it('shows an error with Retry when the server cannot be reached, and recovers', async () => {
    let up = false
    mockApi({
      ...loggedOut,
      [VERIFY]: () =>
        up
          ? okData(makeUser())
          : apiError(500, 'internal_error', 'Something went wrong on our side.'),
    })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')

    up = true
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeInTheDocument()
  })
})
