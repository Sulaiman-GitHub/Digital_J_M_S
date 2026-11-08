import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { apiError, loggedOut, makeUser, mockApi, okData, renderWithAuth } from '../../test/utils'
import { RegisterPage } from './RegisterPage'

const REGISTER = 'POST /api/v1/auth/register'

function renderPage() {
  return renderWithAuth(
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
    </Routes>,
    { route: '/register' },
  )
}

async function fill(email: string, password: string, agree = true) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  if (agree) await userEvent.click(screen.getByRole('checkbox', { name: /I agree to the/ }))
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Create account' }))

describe('RegisterPage', () => {
  it('validates on the client and does not call the API', async () => {
    const api = mockApi({ ...loggedOut })
    renderPage()

    await submit()

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument()
    expect(screen.getByText('Choose a password')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/register')).toHaveLength(0)
  })

  it('will not submit until the Terms and Privacy Policy are accepted', async () => {
    const api = mockApi({ ...loggedOut })
    renderPage()
    const box = screen.getByRole('checkbox', { name: /I agree to the/ })
    expect(box).not.toBeChecked()

    await fill('nakato@example.com', 'Kampala-Sunrise-42', false)
    await submit()

    expect(
      await screen.findByText('Agree to the Terms and the Privacy Policy to create an account'),
    ).toBeInTheDocument()
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(api.callsTo('POST', '/api/v1/auth/register')).toHaveLength(0)
  })

  it('clears the consent error once the box is ticked', async () => {
    mockApi({ ...loggedOut, [REGISTER]: () => okData(makeUser()) })
    renderPage()
    await fill('nakato@example.com', 'Kampala-Sunrise-42', false)
    await submit()
    await screen.findByText(/Agree to the Terms/)

    await userEvent.click(screen.getByRole('checkbox', { name: /I agree to the/ }))
    await submit()

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  })

  it('links to the Terms and the Privacy Policy, opening them in a new tab', () => {
    mockApi({ ...loggedOut })
    renderPage()

    const terms = screen.getByRole('link', { name: 'Terms of Use' })
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' })

    expect(terms).toHaveAttribute('href', '/terms')
    expect(privacy).toHaveAttribute('href', '/privacy')
    for (const link of [terms, privacy]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })

  it('shows a server refusal of the consent under the checkbox', async () => {
    mockApi({
      ...loggedOut,
      [REGISTER]: () =>
        apiError(422, 'validation_error', 'Some fields are invalid.', {
          fields: {
            accept_terms: 'Agree to the Terms and the Privacy Policy to create an account.',
          },
        }),
    })
    renderPage()

    await fill('nakato@example.com', 'Kampala-Sunrise-42')
    await submit()

    expect(
      await screen.findByRole('checkbox', { name: /I agree to the/ }),
    ).toHaveAccessibleDescription(/Agree to the Terms/)
  })

  it('refuses a malformed email and a short password', async () => {
    mockApi({ ...loggedOut })
    renderPage()

    await fill('not-an-email', 'short')
    await submit()

    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('preselects "Looking for work" and sends the chosen role, email and password', async () => {
    const api = mockApi({
      ...loggedOut,
      [REGISTER]: () => okData(makeUser({ email: 'hr@ssese-foods.example.com', role: 'employer' })),
    })
    renderPage()
    expect(screen.getByRole('radio', { name: /Looking for work/ })).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: /Hiring/ }))
    await fill('  hr@ssese-foods.example.com ', 'Kampala-Sunrise-42')
    await submit()

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText('hr@ssese-foods.example.com')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/register')[0].body).toEqual({
      email: 'hr@ssese-foods.example.com',
      password: 'Kampala-Sunrise-42',
      role: 'employer',
      accept_terms: true,
    })
    expect(screen.getByRole('link', { name: 'Continue to log in' })).toHaveAttribute(
      'href',
      '/login',
    )
  })

  it('shows "email already exists" under the email field', async () => {
    mockApi({
      ...loggedOut,
      [REGISTER]: () =>
        apiError(
          409,
          'email_taken',
          'An account with this email already exists. Log in or reset your password.',
        ),
    })
    renderPage()

    await fill('nakato@example.com', 'Kampala-Sunrise-42')
    await submit()

    const field = await screen.findByLabelText('Email')
    expect(field).toHaveAccessibleDescription(/An account with this email already exists/)
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows server field errors on the matching input', async () => {
    mockApi({
      ...loggedOut,
      [REGISTER]: () =>
        apiError(422, 'validation_error', 'Some fields are invalid.', {
          fields: { password: 'This password is too common. Choose one that is harder to guess.' },
        }),
    })
    renderPage()

    await fill('nakato@example.com', 'Password-123')
    await submit()

    expect(await screen.findByLabelText('Password')).toHaveAccessibleDescription(/too common/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a rate limit message in an alert above the form', async () => {
    mockApi({
      ...loggedOut,
      [REGISTER]: () =>
        apiError(429, 'rate_limited', 'Too many requests. Please wait a minute and try again.'),
    })
    renderPage()

    await fill('nakato@example.com', 'Kampala-Sunrise-42')
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
  })

  it('shows unexpected server errors as a toast, not on the form', async () => {
    mockApi({
      ...loggedOut,
      [REGISTER]: () =>
        apiError(500, 'internal_error', 'Something went wrong on our side. Please try again.'),
    })
    renderPage()

    await fill('nakato@example.com', 'Kampala-Sunrise-42')
    await submit()

    expect(
      await screen.findByText('Something went wrong on our side. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('can show and hide the password', async () => {
    mockApi({ ...loggedOut })
    renderPage()
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'password')
  })
})
