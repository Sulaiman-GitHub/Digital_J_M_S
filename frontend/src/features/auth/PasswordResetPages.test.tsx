import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { apiError, loggedOut, mockApi, okData, renderWithAuth } from '../../test/utils'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { ResetPasswordPage } from './ResetPasswordPage'

const FORGOT = 'POST /api/v1/auth/forgot-password'
const RESET = 'POST /api/v1/auth/reset-password'

function renderForgot() {
  return renderWithAuth(
    <Routes>
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    </Routes>,
    { route: '/forgot-password' },
  )
}

function renderReset(route = '/reset-password?token=tok123') {
  return renderWithAuth(
    <Routes>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Routes>,
    { route },
  )
}

describe('ForgotPasswordPage', () => {
  it('validates the email on the client', async () => {
    const api = mockApi({ ...loggedOut })
    renderForgot()

    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/forgot-password')).toHaveLength(0)
  })

  it('shows the same confirmation whatever the server knows about the account', async () => {
    const api = mockApi({
      ...loggedOut,
      [FORGOT]: () =>
        okData({ message: 'If an account exists for this email, we sent a reset link.' }, 202),
    })
    renderForgot()

    await userEvent.type(screen.getByLabelText('Email'), ' nakato@example.com ')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText(/If an account exists for this email/)).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/forgot-password')[0].body).toEqual({
      email: 'nakato@example.com',
    })
  })

  it('shows a rate limit message in an alert', async () => {
    mockApi({
      ...loggedOut,
      [FORGOT]: () =>
        apiError(429, 'rate_limited', 'Too many requests. Please wait a minute and try again.'),
    })
    renderForgot()

    await userEvent.type(screen.getByLabelText('Email'), 'nakato@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
  })
})

describe('ResetPasswordPage', () => {
  async function submitPassword(password: string) {
    await userEvent.type(screen.getByLabelText('New password'), password)
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))
  }

  it('refuses a short password on the client', async () => {
    const api = mockApi({ ...loggedOut })
    renderReset()

    await submitPassword('short')

    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/reset-password')).toHaveLength(0)
  })

  it('sends the token and new password, then offers to log in', async () => {
    const api = mockApi({
      ...loggedOut,
      [RESET]: () => okData({ message: 'Your password was changed.' }),
    })
    renderReset()

    await submitPassword('Mbarara-Hills-77')

    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/reset-password')[0].body).toEqual({
      token: 'tok123',
      new_password: 'Mbarara-Hills-77',
    })
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })

  it('shows a server password rule under the field and keeps the form', async () => {
    mockApi({
      ...loggedOut,
      [RESET]: () =>
        apiError(422, 'validation_error', 'Some fields are invalid.', {
          fields: {
            new_password: 'This password is too common. Choose one that is harder to guess.',
          },
        }),
    })
    renderReset()

    await submitPassword('Password-123')

    expect(await screen.findByLabelText('New password')).toHaveAccessibleDescription(/too common/)
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeInTheDocument()
  })

  it.each([
    ['token_expired', 'This link has expired. Request a new one.'],
    ['token_used', 'This link has already been used or was replaced by a newer one.'],
  ])('explains a %s link and offers a new one', async (code, message) => {
    mockApi({ ...loggedOut, [RESET]: () => apiError(400, code, message) })
    renderReset()

    await submitPassword('Mbarara-Hills-77')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })

  it('treats a missing token as an unusable link without calling the API', () => {
    const api = mockApi({ ...loggedOut })
    renderReset('/reset-password')

    expect(screen.getByRole('heading', { name: 'This link cannot be used' })).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/reset-password')).toHaveLength(0)
  })
})
