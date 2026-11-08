import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { useAuth } from '../features/auth/authContext'
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
import { VerifyEmailBanner } from './VerifyEmailBanner'

const RESEND = 'POST /api/v1/auth/resend-verification'

/** Shows when the session check has finished, so "not shown" assertions are not vacuous. */
function Probe() {
  return <p>auth: {useAuth().status}</p>
}

afterEach(() => {
  document.cookie = 'djm_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
})

describe('VerifyEmailBanner', () => {
  it('is hidden for visitors', async () => {
    mockApi({ ...loggedOut })
    renderWithAuth(
      <>
        <VerifyEmailBanner />
        <Probe />
      </>,
    )

    await screen.findByText('auth: unauthenticated')

    expect(screen.queryByRole('region', { name: 'Email verification' })).not.toBeInTheDocument()
  })

  it('is hidden for users whose email is verified', async () => {
    mockApi({ ...loggedIn(makeUser({ email_verified: true })) })
    renderWithAuth(
      <>
        <VerifyEmailBanner />
        <Probe />
      </>,
    )

    await screen.findByText('auth: authenticated')

    expect(screen.queryByRole('region', { name: 'Email verification' })).not.toBeInTheDocument()
  })

  it('shows for an unverified user with their email address', async () => {
    mockApi({ ...loggedIn(makeUser({ email_verified: false })) })
    renderWithAuth(<VerifyEmailBanner />)

    const banner = await screen.findByRole('region', { name: 'Email verification' })

    expect(banner).toHaveTextContent('Verify your email to apply for jobs')
    expect(banner).toHaveTextContent('nakato@example.com')
  })

  it('resends the link with the CSRF header and confirms with a toast', async () => {
    document.cookie = 'djm_csrf=csrf-token-123'
    const api = mockApi({
      ...loggedIn(makeUser({ email_verified: false })),
      [RESEND]: () => okData({ message: 'We sent a new verification link.' }, 202),
    })
    renderWithAuth(<VerifyEmailBanner />)

    await userEvent.click(await screen.findByRole('button', { name: 'Resend link' }))

    expect(await screen.findByText('We sent a new verification link.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/resend-verification')[0].headers['X-CSRF-Token']).toBe(
      'csrf-token-123',
    )
  })

  it('refreshes the user when the email turns out to be verified already', async () => {
    let verified = false
    const api = mockApi({
      [ME]: () => okData(makeUser({ email_verified: verified })),
      [RESEND]: () => {
        verified = true
        return apiError(409, 'email_already_verified', 'Your email is already verified.')
      },
    })
    renderWithAuth(<VerifyEmailBanner />)

    await userEvent.click(await screen.findByRole('button', { name: 'Resend link' }))

    expect(await screen.findByText('Your email is already verified.')).toBeInTheDocument()
    await screen.findByText('Your email is already verified.')
    expect(api.callsTo('GET', '/api/v1/auth/me').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('region', { name: 'Email verification' })).not.toBeInTheDocument()
  })

  it('shows rate limit errors as a toast and keeps the banner', async () => {
    mockApi({
      ...loggedIn(makeUser({ email_verified: false })),
      [RESEND]: () =>
        apiError(429, 'rate_limited', 'Too many requests. Please wait a minute and try again.'),
    })
    renderWithAuth(<VerifyEmailBanner />)

    await userEvent.click(await screen.findByRole('button', { name: 'Resend link' }))

    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Email verification' })).toBeInTheDocument()
  })
})
