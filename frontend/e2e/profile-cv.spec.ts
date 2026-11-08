import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { PASSWORD, uniqueEmail } from './helpers.ts'

// Phase 2 journey and gate: a student completes the profile, uploads a CV,
// downloads it and gives consent; and one user can never reach another user's CV.

const CV = '/api/v1/cv/me'
const DOWNLOAD = '/api/v1/cv/me/download'
const PDF_TYPE = 'application/pdf'

/** A small but real-looking PDF. The first bytes are what the server checks. */
function pdfBytes(label: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Title (${label}) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
  )
}

async function registerAccount(request: APIRequestContext, email: string) {
  const response = await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, role: 'job_seeker', accept_terms: true },
  })
  expect(response.status()).toBe(201)
}

/** A separate, logged-in API client with its own cookies (one per user). */
async function loggedInApi(
  playwright: { request: { newContext: (o: { baseURL: string }) => Promise<APIRequestContext> } },
  baseURL: string,
  email: string,
) {
  const api = await playwright.request.newContext({ baseURL })
  const login = await api.post('/api/v1/auth/login', { data: { email, password: PASSWORD } })
  expect(login.status()).toBe(200)
  const { cookies } = await api.storageState()
  const csrf = cookies.find((cookie) => cookie.name === 'djm_csrf')?.value ?? ''
  return { api, csrfHeaders: { 'X-CSRF-Token': csrf } }
}

async function logInThroughTheForm(page: Page, email: string) {
  await page.goto('/login?next=%2Fprofile')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Your profile', level: 1 })).toBeVisible()
}

test('a student completes the profile, uploads a CV, downloads it and gives consent', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('student')
  const cv = pdfBytes('Nakato')
  await registerAccount(request, email)
  await logInThroughTheForm(page, email)

  // Basics
  await page.getByLabel('Full name').fill('Nakato Sarah')
  await page.getByLabel('District where you live').selectOption({ label: 'Kampala' })
  await page.getByRole('button', { name: 'Continue' }).click()

  // Education (the first save)
  await expect(page.getByRole('heading', { name: 'Education', level: 2 })).toBeVisible()
  await page.getByRole('combobox', { name: 'Institution' }).click()
  await page.getByRole('option', { name: 'Makerere University', exact: true }).click()
  await page.getByLabel('Qualification').selectOption({ label: "Bachelor's degree" })
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Skills', level: 2 })).toBeVisible()
  await expect(page.getByText('40% saved')).toBeVisible()

  // Skip to the last step.
  await page.getByRole('button', { name: /^CV and consent/ }).click()
  await expect(page.getByRole('heading', { name: 'CV and consent', level: 2 })).toBeVisible()
  await expect(page.getByText('No CV yet')).toBeVisible()

  // A file that is not a real PDF is refused, and nothing is stored.
  await page.getByLabel('CV file').setInputFiles({
    name: 'virus.pdf',
    mimeType: PDF_TYPE,
    buffer: Buffer.from('MZ this is not a pdf'),
  })
  await expect(page.getByRole('alert')).toContainText('not a real PDF')
  await expect(page.getByText('No CV yet')).toBeVisible()

  // A real one is accepted.
  await page
    .getByLabel('CV file')
    .setInputFiles({ name: 'Nakato Sarah CV.pdf', mimeType: PDF_TYPE, buffer: cv })
  await expect(page.getByText('Nakato Sarah CV.pdf')).toBeVisible()
  await expect(page.getByText('Your CV is saved.')).toBeVisible()

  // Download gives back exactly the uploaded bytes.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('Nakato Sarah CV.pdf')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  expect(Buffer.concat(chunks).equals(cv)).toBe(true)

  // Consent to share with employers.
  const sharing = page.getByRole('checkbox', { name: /Employers I apply to may see/ })
  await expect(sharing).not.toBeChecked()
  await sharing.click()
  await expect(sharing).toBeChecked()

  // Everything is still there after a reload.
  await page.reload()
  await page.getByRole('button', { name: /^CV and consent/ }).click()
  await expect(page.getByText('Nakato Sarah CV.pdf')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /Employers I apply to may see/ })).toBeChecked()

  // The server holds all three consents: terms and privacy from registration, plus sharing.
  const consents = await page.request.get('/api/v1/consents/me')
  const types = ((await consents.json()) as { data: { consent_type: string }[] }).data
    .map((item) => item.consent_type)
    .sort()
  expect(types).toEqual(['cv_sharing_with_employers', 'privacy', 'terms'])

  // Replace, then delete.
  await page
    .getByLabel('CV file')
    .setInputFiles({ name: 'Second.pdf', mimeType: PDF_TYPE, buffer: pdfBytes('Second') })
  await expect(page.getByText('Second.pdf')).toBeVisible()
  await expect(page.getByText('Nakato Sarah CV.pdf')).toHaveCount(0)
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete CV' }).click()
  await expect(page.getByText('No CV yet')).toBeVisible()
})

test('registration needs the Terms and Privacy Policy to be accepted', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Email').fill(uniqueEmail('noconsent'))
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)

  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByText(/Agree to the Terms and the Privacy Policy/)).toBeVisible()
  await expect(page).toHaveURL(/\/register$/)

  // The legal pages are public and say they are drafts.
  await page.goto('/terms')
  await expect(page.getByText(/to be reviewed by a lawyer/)).toBeVisible()
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible()
})

test('a second user only ever reaches their own CV', async ({ playwright, baseURL }) => {
  const emailA = uniqueEmail('owner')
  const emailB = uniqueEmail('other')
  const cvA = pdfBytes('Owner CV')
  const cvB = pdfBytes('Other CV')
  const anonymous = await playwright.request.newContext({ baseURL: baseURL ?? '' })
  await registerAccount(anonymous, emailA)
  await registerAccount(anonymous, emailB)
  const a = await loggedInApi(playwright, baseURL ?? '', emailA)
  const b = await loggedInApi(playwright, baseURL ?? '', emailB)

  const upload = (user: typeof a, name: string, buffer: Buffer) =>
    user.api.post(CV, {
      headers: user.csrfHeaders,
      multipart: { file: { name, mimeType: PDF_TYPE, buffer } },
    })

  expect((await upload(a, 'owner.pdf', cvA)).status()).toBe(201)

  // B has no CV: A's is invisible to them, on every endpoint.
  for (const path of [CV, DOWNLOAD]) {
    const response = await b.api.get(path)
    expect(response.status(), path).toBe(404)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('cv_not_found')
  }
  expect((await b.api.delete(CV, { headers: b.csrfHeaders })).status()).toBe(404)

  // B uploads their own; each user's download is their own file, byte for byte.
  expect((await upload(b, 'other.pdf', cvB)).status()).toBe(201)
  expect(Buffer.from(await (await a.api.get(DOWNLOAD)).body()).equals(cvA)).toBe(true)
  expect(Buffer.from(await (await b.api.get(DOWNLOAD)).body()).equals(cvB)).toBe(true)

  // B deleting theirs leaves A's alone.
  expect((await b.api.delete(CV, { headers: b.csrfHeaders })).status()).toBe(204)
  expect((await a.api.get(CV)).status()).toBe(200)

  // Not logged in: refused.
  expect((await anonymous.get(CV)).status()).toBe(401)
  expect((await anonymous.get(DOWNLOAD)).status()).toBe(401)

  // There is no way to ask for someone else's CV by id: the API has no such route (read from the
  // backend directly, since the frontend server would answer with the web page).
  const spec = (await (await anonymous.get('http://localhost:8000/openapi.json')).json()) as {
    paths: Record<string, unknown>
  }
  expect(Object.keys(spec.paths).filter((path) => path.startsWith('/api/v1/cv'))).toEqual([
    '/api/v1/cv/me',
    '/api/v1/cv/me/download',
  ])
  for (const guess of [`${CV}/1`, '/api/v1/cv/1', '/api/v1/cvs', '/api/v1/cvs/1/download']) {
    const response = await a.api.get(guess)
    expect([404, 405], guess).toContain(response.status())
  }

  await Promise.all([anonymous.dispose(), a.api.dispose(), b.api.dispose()])
})
