import { expect, test, type Page } from '@playwright/test'
import { linkPath, NEW_PASSWORD, PASSWORD, uniqueEmail, waitForEmail } from './helpers.ts'

// Phase 1 journey: a real browser, the real frontend, the real backend and the
// test database. Emails are read from the test-only inbox.

async function register(page: Page, email: string, password = PASSWORD) {
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel(/I agree to the Terms/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
}

async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

test('register, verify email, log in, reach a protected page, log out', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('journey')

  // A visitor is sent to login and remembered (?next=).
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/)

  // Register.
  await register(page, email)
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()

  // The verification link arrives by email.
  const message = await waitForEmail(request, email, 'Confirm your email address')
  await page.goto(linkPath(message))
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()

  // Log in, and land on the page we were originally sent away from.
  await page.goto('/login?next=%2Faccount')
  await logIn(page, email)
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible()
  await expect(page.getByRole('main').getByText(email)).toBeVisible()
  await expect(page.getByText('Verified', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Email verification' })).toBeHidden()

  // The session survives a reload.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible()

  // Log out: the protected page needs a login again.
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Log in' })).toBeVisible()
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/)
})

test('a registration request with role=admin is rejected and creates no account', async ({
  request,
}) => {
  const email = uniqueEmail('admin-attempt')

  const response = await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, role: 'admin', accept_terms: true },
  })

  expect(response.status()).toBe(422)
  const body = await response.json()
  expect(body.error.code).toBe('validation_error')
  expect(body.error.details.fields).toHaveProperty('role')

  // Nothing was created: the same credentials cannot log in, and no email was sent.
  const login = await request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } })
  expect(login.status()).toBe(401)
  const inbox = await request.get('/api/v1/_test/emails', { params: { to: email } })
  expect((await inbox.json()).data).toEqual([])
})

test('an unverified user can log in and sees the verify banner', async ({ page, request }) => {
  const email = uniqueEmail('unverified')
  await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, role: 'employer', accept_terms: true },
  })

  await page.goto('/login?next=%2Faccount')
  await logIn(page, email)

  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Email verification' })).toBeVisible()
  await expect(page.getByText('Not verified')).toBeVisible()
  await expect(page.getByText('Employer', { exact: true })).toBeVisible()
})

test('wrong password and duplicate email show errors', async ({ page, request }) => {
  const email = uniqueEmail('errors')
  await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, role: 'job_seeker', accept_terms: true },
  })

  await register(page, email)
  await expect(page.getByLabel('Email')).toHaveAccessibleDescription(/already exists/)

  await page.goto('/login')
  await logIn(page, email, 'Wrong-Password-99')
  await expect(page.getByRole('alert')).toHaveText(/Invalid email or password\./)
  await expect(page).toHaveURL(/\/login$/)
})

test('a verification link works once', async ({ page, request }) => {
  const email = uniqueEmail('used-link')
  await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, role: 'job_seeker', accept_terms: true },
  })
  const path = linkPath(await waitForEmail(request, email, 'Confirm your email address'))

  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()

  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'This link was already used' })).toBeVisible()
})

test('forgot password: reset with the emailed link, then log in with the new password', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('reset')
  await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, role: 'job_seeker', accept_terms: true },
  })

  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  const message = await waitForEmail(request, email, 'Reset your password')
  await page.goto(linkPath(message))
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible()

  // The old password no longer works; the new one does.
  await page.goto('/login')
  await logIn(page, email, PASSWORD)
  await expect(page.getByRole('alert')).toHaveText(/Invalid email or password\./)
  await logIn(page, email, NEW_PASSWORD)
  await expect(page).toHaveURL(/\/account$/)
})

test('an unknown email gets the same forgot-password answer and no email', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('ghost')

  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByText(/If an account exists for this email/)).toBeVisible()
  const inbox = await request.get('/api/v1/_test/emails', { params: { to: email } })
  expect((await inbox.json()).data).toEqual([])
})
