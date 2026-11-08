import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PASSWORD,
  linkPath,
  uniqueEmail,
  waitForEmail,
} from './helpers.ts'
import { apiLogin, verifiedUserByApi, type ApiUser } from './api-helpers.ts'

// Phase 3 journey and gate: an employer registers, fills the company profile and
// submits; an admin approves; the employer sees "Approved". And an employer who is not approved
// cannot publish, even by calling the API directly.

const VACANCIES = '/api/v1/employer/vacancies'
const SOME_ID = '3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10'

/**
 * Try to publish a real vacancy through the API: create a draft, then publish it. Returns the
 * publish response (or the create response if creating was already refused, for example 403 for
 * a job seeker or 401 when not logged in).
 */
async function tryToPublish(api: APIRequestContext, headers: Record<string, string>) {
  const districts = (
    (await (await api.get('/api/v1/reference/districts')).json()) as { data: { id: string }[] }
  ).data
  const created = await api.post(VACANCIES, {
    headers,
    data: {
      title: 'E2E Accounts Assistant',
      description: 'Prepare invoices and reconcile accounts.',
      employment_type: 'full_time',
      work_arrangement: 'onsite',
      district_id: districts[0].id,
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    },
  })
  if (created.status() !== 201) return created
  const { data } = (await created.json()) as { data: { id: string } }
  return api.post(`${VACANCIES}/${data.id}/publish`, { headers })
}

function companyName(label: string): string {
  return `E2E ${label} ${Date.now()}${Math.random().toString(36).slice(2, 6)}`
}

// ---------- helpers ----------

async function registerThroughTheForm(page: Page, email: string) {
  await page.goto('/register')
  await page.getByRole('radio', { name: /Hiring/ }).check()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel(/I agree to the/).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
}

async function verifyThroughTheLink(page: Page, request: APIRequestContext, email: string) {
  const message = await waitForEmail(request, email, 'Confirm your email address')
  await page.goto(linkPath(message))
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()
}

async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

async function adminPage(browser: Browser): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await logIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  return { page, context }
}

async function fillCompany(page: Page, name: string) {
  await page.goto('/employer/profile')
  await page.getByLabel('Company name').fill(name)
  await page.getByLabel('Registration number').fill('80020012345678')
  await page.getByLabel('Phone').fill('0414 123456')
  await page.getByLabel('District').selectOption({ label: 'Kampala' })
  await page.getByLabel('What does your company do?').fill('We make and sell fruit juice.')
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByText('Company profile saved.')).toBeVisible()
}

async function submitForVerification(page: Page) {
  await page.getByRole('button', { name: 'Submit for verification' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Sent for verification.')).toBeVisible()
}

async function openInAdminQueue(admin: Page, name: string) {
  await admin.goto('/admin/employers')
  await admin.getByRole('link', { name: new RegExp(name) }).click()
  await expect(admin.getByRole('heading', { name, level: 1 })).toBeVisible()
}

async function decideWithReason(
  admin: Page,
  openName: string,
  confirmName: string,
  reason: string,
) {
  await admin.getByRole('button', { name: openName }).click()
  const dialog = admin.getByRole('dialog')
  await dialog.getByLabel(/Reason/).fill(reason)
  await dialog.getByRole('button', { name: confirmName, exact: true }).click()
}

const banner = (page: Page) => page.getByTestId('verification-banner')

async function csrfOf(context: BrowserContext): Promise<Record<string, string>> {
  const cookies = await context.cookies()
  return {
    'X-CSRF-Token':
      cookies.find((cookie: { name: string }) => cookie.name === 'djm_csrf')?.value ?? '',
  }
}

// ---------- the journey ----------

test('an employer registers, fills the profile and submits; an admin approves; the employer sees Approved', async ({
  page,
  request,
  browser,
}) => {
  const email = uniqueEmail('employer')
  const name = companyName('Journey')

  // Register and confirm the email address.
  await registerThroughTheForm(page, email)
  await verifyThroughTheLink(page, request, email)
  await logIn(page, email)

  // Before anything: a banner asks for the profile, and publishing is disabled with a reason.
  await page.goto('/employer')
  await expect(banner(page)).toContainText('Your company is not verified yet')
  await page.goto('/employer/vacancies/new')
  const publish = page.getByRole('button', { name: 'Publish' })
  await expect(publish).toHaveAttribute('aria-disabled', 'true')
  await expect(publish).toHaveAccessibleDescription(/Available once your company is verified/)

  // Fill the profile. Submit stays blocked until the details are saved.
  await page.goto('/employer/profile')
  await page.getByLabel('Company name').fill(name)
  await page.getByLabel('District').selectOption({ label: 'Kampala' })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Company profile saved.')).toBeVisible()
  const submit = page.getByRole('button', { name: 'Submit for verification' })
  await expect(submit).toHaveAttribute('aria-disabled', 'true')
  await expect(submit).toHaveAccessibleDescription(/Add the registration number/)
  await fillCompany(page, name)
  await submitForVerification(page)

  // Pending: banner says so, the form is read-only, and the API still refuses publishing.
  await expect(banner(page)).toContainText('We are checking your company')
  await expect(page.getByLabel('Company name')).toBeDisabled()
  const refused = await tryToPublish(page.request, await csrfOf(page.context()))
  expect(refused.status()).toBe(403)
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
    'employer_not_verified',
  )

  // The admin finds it in the queue, sees the checklist, and approves.
  const { page: admin, context } = await adminPage(browser)
  await openInAdminQueue(admin, name)
  await expect(admin.getByText('Registration details: provided')).toBeVisible()
  await expect(admin.getByText('Working phone or website: provided')).toBeVisible()
  await admin.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(admin.getByText('Company approved.')).toBeVisible()
  await expect(admin.getByRole('list', { name: 'Verification history' })).toContainText('Approved')
  await context.close()

  // The employer sees Approved, and publishing now gets through.
  await page.goto('/employer')
  await expect(banner(page)).toContainText('Your company is verified')
  await page.goto('/employer/vacancies/new')
  await expect(page.getByRole('button', { name: 'Publish' })).not.toHaveAttribute('aria-disabled')
  const allowed = await tryToPublish(page.request, await csrfOf(page.context()))
  expect(allowed.status()).toBe(200)
})

test('a rejected company sees the reason, fixes it, is approved, then suspended and reinstated', async ({
  page,
  request,
  browser,
}) => {
  const email = uniqueEmail('cycle')
  const name = companyName('Cycle')
  await registerThroughTheForm(page, email)
  await verifyThroughTheLink(page, request, email)
  await logIn(page, email)
  await fillCompany(page, name)
  await submitForVerification(page)

  const { page: admin, context } = await adminPage(browser)

  // Rejected without a reason is not possible.
  await openInAdminQueue(admin, name)
  await admin.getByRole('button', { name: 'Reject…' }).click()
  await admin.getByRole('dialog').getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(admin.getByText('Give a reason. The employer will see it.')).toBeVisible()
  await admin
    .getByRole('dialog')
    .getByLabel(/Reason/)
    .fill('Please add your TIN to the description.')
  await admin.getByRole('dialog').getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(admin.getByText('Company rejected.')).toBeVisible()

  // The employer sees why, edits and sends it again.
  await page.reload()
  await expect(banner(page)).toContainText('Your company was not approved')
  await expect(banner(page)).toContainText('Please add your TIN to the description.')
  await page.goto('/employer/profile')
  await page.getByLabel('What does your company do?').fill('We make fruit juice. TIN 1000123456.')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Company profile saved.')).toBeVisible()
  await submitForVerification(page)

  // Approve, then suspend with a reason.
  await admin.reload()
  await admin.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(admin.getByText('Company approved.')).toBeVisible()
  await decideWithReason(admin, 'Suspend…', 'Suspend', 'Applicants reported unpaid fees.')
  await expect(admin.getByText('Company suspended.')).toBeVisible()

  await page.goto('/employer')
  await expect(banner(page)).toContainText('Your company is suspended')
  await expect(banner(page)).toContainText('Applicants reported unpaid fees.')
  await page.goto('/employer/vacancies/new')
  await expect(page.getByRole('button', { name: 'Publish' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.goto('/employer')
  const blocked = await tryToPublish(page.request, await csrfOf(page.context()))
  expect(blocked.status()).toBe(403)

  // Approve again: publishing is back.
  await admin.getByRole('button', { name: 'Approve again' }).click()
  await expect(admin.getByText('Company approved again.')).toBeVisible()
  await page.reload()
  await expect(banner(page)).toContainText('Your company is verified')
  const allowed = await tryToPublish(page.request, await csrfOf(page.context()))
  expect(allowed.status()).toBe(200)

  // The whole story is in the history, newest first.
  await admin.reload()
  const history = admin.getByRole('list', { name: 'Verification history' }).getByRole('listitem')
  await expect(history.first()).toContainText('Approved')
  await expect(history).toHaveCount(6)
  await context.close()
})

test('role guards: an employer cannot open admin pages, and an admin cannot open employer pages', async ({
  page,
  request,
  browser,
}) => {
  const email = uniqueEmail('guard')
  await registerThroughTheForm(page, email)
  await verifyThroughTheLink(page, request, email)
  await logIn(page, email)

  await page.goto('/admin/employers')
  await expect(
    page.getByRole('heading', { name: 'You do not have permission to see this page' }),
  ).toBeVisible()

  const { page: admin, context } = await adminPage(browser)
  await admin.goto('/employer')
  await expect(
    admin.getByRole('heading', { name: 'You do not have permission to see this page' }),
  ).toBeVisible()
  await context.close()
})

// ---------- the gate, through the API ----------

test('an employer who is not approved cannot publish, even through the API', async ({
  playwright,
  baseURL,
  request,
}) => {
  const url = baseURL ?? ''
  const employer = await verifiedUserByApi(playwright, url, request, uniqueEmail('gate'))
  const seeker = await verifiedUserByApi(
    playwright,
    url,
    request,
    uniqueEmail('gateseeker'),
    'job_seeker',
  )
  const admin = await apiLogin(playwright, url, ADMIN_EMAIL, ADMIN_PASSWORD)
  const publish = (user: ApiUser) => tryToPublish(user.api, user.headers)
  const code = async (response: Awaited<ReturnType<typeof publish>>) =>
    ((await response.json()) as { error: { code: string } }).error.code

  // No company yet: the gate answers before it even looks at the vacancy.
  let response = await employer.api.post(`${VACANCIES}/${SOME_ID}/publish`, {
    headers: employer.headers,
  })
  expect(response.status()).toBe(403)
  expect(await code(response)).toBe('employer_not_verified')

  // Draft.
  const districts = (
    (await (await employer.api.get('/api/v1/reference/districts')).json()) as {
      data: { id: string }[]
    }
  ).data
  const saved = await employer.api.put('/api/v1/employer/me', {
    headers: employer.headers,
    data: {
      company_name: companyName('Gate'),
      registration_number: '80020012345678',
      contact_phone: '0414 123456',
      description: 'We make fruit juice.',
      district_id: districts[0].id,
    },
  })
  expect(saved.status()).toBe(200)
  const employerId = ((await saved.json()) as { data: { id: string } }).data.id
  response = await publish(employer)
  expect(response.status()).toBe(403)
  expect(await code(response)).toBe('employer_not_verified')

  // Pending.
  expect(
    (await employer.api.post('/api/v1/employer/me/submit', { headers: employer.headers })).status(),
  ).toBe(200)
  response = await publish(employer)
  expect(response.status()).toBe(403)
  expect(await code(response)).toBe('employer_not_verified')

  // The employer cannot approve themselves, and neither can a job seeker.
  for (const user of [employer, seeker]) {
    const attempt = await user.api.post(`/api/v1/admin/employers/${employerId}/approve`, {
      headers: user.headers,
    })
    expect(attempt.status()).toBe(403)
  }
  expect((await publish(employer)).status()).toBe(403)

  // Rejected.
  const rejected = await admin.api.post(`/api/v1/admin/employers/${employerId}/reject`, {
    headers: admin.headers,
    data: { reason: 'Needs more detail.' },
  })
  expect(rejected.status()).toBe(200)
  response = await publish(employer)
  expect(response.status()).toBe(403)
  expect(await code(response)).toBe('employer_not_verified')

  // A job seeker is refused by role.
  response = await publish(seeker)
  expect(response.status()).toBe(403)
  expect(await code(response)).toBe('forbidden')

  // Resubmit, approve: now it works.
  await employer.api.post('/api/v1/employer/me/submit', { headers: employer.headers })
  const approved = await admin.api.post(`/api/v1/admin/employers/${employerId}/approve`, {
    headers: admin.headers,
  })
  expect(approved.status()).toBe(200)
  expect((await publish(employer)).status()).toBe(200)

  // Suspended: blocked again, immediately.
  const suspended = await admin.api.post(`/api/v1/admin/employers/${employerId}/suspend`, {
    headers: admin.headers,
    data: { reason: 'Complaint.' },
  })
  expect(suspended.status()).toBe(200)
  response = await publish(employer)
  expect(response.status()).toBe(403)
  expect(await code(response)).toBe('employer_not_verified')

  // Not logged in at all.
  const anonymous = await playwright.request.newContext({ baseURL: url })
  expect((await anonymous.post(`${VACANCIES}/${SOME_ID}/publish`)).status()).toBe(401)

  await Promise.all([
    employer.api.dispose(),
    seeker.api.dispose(),
    admin.api.dispose(),
    anonymous.dispose(),
  ])
})
