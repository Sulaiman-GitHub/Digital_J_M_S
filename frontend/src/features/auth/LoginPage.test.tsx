import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { apiError, loggedOut, makeUser, mockApi, okData, renderWithAuth } from '../../test/utils'
import { LoginPage } from './LoginPage'

const LOGIN = 'POST /api/v1/auth/login'

function renderPage(route = '/login') {
  return renderWithAuth(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/account" element={<p>Account page</p>} />
      <Route path="/jobs/:id" element={<p>Job page</p>} />
      <Route path="*" element={<p>Somewhere else</p>} />
    </Routes>,
    { route },
  )
}

async function logIn(email = 'nakato@example.com', password = 'Kampala-Sunrise-42') {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

describe('LoginPage', () => {
  it('validates on the client and does not call the API', async () => {
    const api = mockApi({ ...loggedOut })
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/login')).toHaveLength(0)
  })

  it('links to forgot password and register', () => {
    mockApi({ ...loggedOut })
    renderPage()

    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    )
  })

  it('logs in and goes to the account page', async () => {
    const api = mockApi({ ...loggedOut, [LOGIN]: () => okData(makeUser()) })
    renderPage()

    await logIn()

    expect(await screen.findByText('Account page')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/auth/login')[0].body).toEqual({
      email: 'nakato@example.com',
      password: 'Kampala-Sunrise-42',
    })
  })

  it('returns to the page that asked for login (?next=)', async () => {
    mockApi({ ...loggedOut, [LOGIN]: () => okData(makeUser()) })
    renderPage('/login?next=%2Fjobs%2F42')

    await logIn()

    expect(await screen.findByText('Job page')).toBeInTheDocument()
  })

  it.each([
    '//evil.example/phish',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
  ])('ignores an unsafe next value (%s) and goes to the account page', async (next) => {
    mockApi({ ...loggedOut, [LOGIN]: () => okData(makeUser()) })
    renderPage(`/login?next=${encodeURIComponent(next)}`)

    await logIn()

    expect(await screen.findByText('Account page')).toBeInTheDocument()
  })

  it('shows wrong details in an alert and stays on the page', async () => {
    mockApi({
      ...loggedOut,
      [LOGIN]: () => apiError(401, 'invalid_credentials', 'Invalid email or password.'),
    })
    renderPage()

    await logIn('nakato@example.com', 'Wrong-Password-99')

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('shows the suspended account and lockout messages', async () => {
    let answer = apiError(403, 'account_suspended', 'This account is suspended. Contact support.')
    mockApi({ ...loggedOut, [LOGIN]: () => answer.clone() })
    renderPage()

    await logIn()
    expect(await screen.findByRole('alert')).toHaveTextContent('This account is suspended')

    answer = apiError(
      429,
      'too_many_attempts',
      'Too many failed attempts. Wait 15 minutes or reset your password.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText(/Too many failed attempts/)).toBeInTheDocument()
  })

  it('shows a network failure as a toast', async () => {
    mockApi({
      ...loggedOut,
      [LOGIN]: () => {
        throw new TypeError('Failed to fetch')
      },
    })
    renderPage()

    await logIn()

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument()
  })
})
