import { expect, test, type Page } from '@playwright/test'
import {
  adminByApi,
  approvedEmployerByApi,
  createVacancyByApi,
  firstDistrictId,
  uniqueWord,
  verifiedUserByApi,
} from './api-helpers.ts'
import { PASSWORD, uniqueEmail } from './helpers.ts'

// Phase 4 journey and gate: a verified employer publishes a vacancy; an anonymous
// visitor finds it by keyword on a phone; an expired vacancy is not shown; an unverified employer
// cannot publish; and a reported vacancy can be closed by an admin and leaves the search.

const PHONE = { width: 360, height: 740 }

async function logIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

const noSideScroll = (page: Page) =>
  page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')

const inDays = (days: number) =>
  new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10)

test('a verified employer publishes a vacancy and a visitor finds it by keyword on a phone', async ({
  page,
  request,
  browser,
  playwright,
  baseURL,
}) => {
  const url = baseURL ?? ''
  const word = uniqueWord()
  const title = `Senior ${word}`
  const email = uniqueEmail('publisher')
  await approvedEmployerByApi(playwright, url, request, email, `E2E Brewery ${word}`)

  // The employer writes and publishes the vacancy through the screens.
  await logIn(page, email)
  await page.goto('/employer/vacancies/new')
  await page.getByLabel('Job title').fill(title)
  await page.getByLabel('Job type').selectOption({ label: 'Contract' })
  await page.getByRole('radio', { name: 'On-site' }).check()
  await page.getByLabel('District').selectOption({ label: 'Kampala' })
  await page
    .getByLabel('About the job')
    .fill(`We are hiring a ${word} to run our small batch brewery. Training is provided.`)
  await page.getByLabel('Lowest pay (UGX)').fill('900000')
  await page.getByLabel('Highest pay (UGX)').fill('1200000')
  await page.getByLabel('Show the pay on the vacancy').check()
  await page.getByRole('combobox', { name: 'Skills' }).fill('excel')
  await page.getByRole('listbox').getByRole('option').first().click()
  await page
    .getByRole('checkbox', { name: /: required$/ })
    .first()
    .check()
  await page.getByLabel('Applications close on').fill(inDays(14))
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('Vacancy published.')).toBeVisible()
  await page.waitForURL('/employer')
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toContainText('Live')

  // A visitor on a 360 px phone finds it by keyword from the home page.
  const phone = await browser.newContext({ viewport: PHONE })
  const visitor = await phone.newPage()
  await visitor.goto('/')
  await visitor.getByLabel('What').fill(word)
  await visitor.getByRole('button', { name: 'Search jobs' }).click()
  await expect(visitor).toHaveURL(new RegExp(`/jobs\\?q=${word}`))
  const card = visitor.getByRole('link', { name: new RegExp(title) })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Contract')
  await expect(card).toContainText('UGX 900,000 – 1,200,000')
  expect(await noSideScroll(visitor)).toBe(true)

  // The filters work at phone width: another job type hides it, the right one keeps it.
  await visitor.getByRole('button', { name: /^Filters/ }).click()
  const sheet = visitor.getByRole('dialog', { name: 'Filters' })
  await sheet.getByRole('radio', { name: 'Internship' }).check()
  await expect(sheet.getByRole('button', { name: 'Show 0 jobs' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Show 0 jobs' }).click()
  await expect(visitor.getByText('No jobs match your search')).toBeVisible()
  await visitor.getByRole('button', { name: 'Remove filter: Internship' }).click()
  await expect(card).toBeVisible()
  await visitor.getByRole('button', { name: /^Filters/ }).click()
  await sheet.getByRole('radio', { name: 'Contract' }).check()
  await sheet.getByRole('button', { name: 'Show 1 job' }).click()
  await expect(card).toBeVisible()
  await expect(visitor).toHaveURL(/employment_type=contract/)

  // The details show the requirement as Required, and ask the visitor to log in to apply.
  await card.click()
  await expect(visitor.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  await expect(visitor.getByRole('heading', { name: 'Required' })).toBeVisible()
  await expect(visitor.getByRole('link', { name: 'Log in to apply' })).toBeVisible()
  expect(await noSideScroll(visitor)).toBe(true)
  const detailUrl = visitor.url()

  // The employer closes it; it disappears for the visitor.
  await row.getByRole('link', { name: /^Edit/ }).click()
  await page.getByRole('button', { name: 'Close vacancy…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close vacancy' }).click()
  await expect(page.getByText('Vacancy closed.')).toBeVisible()
  await visitor.goto(detailUrl)
  await expect(
    visitor.getByRole('heading', { name: 'This vacancy is no longer available' }),
  ).toBeVisible()
  await visitor.goto(`/jobs?q=${word}`)
  await expect(visitor.getByText('No jobs match your search')).toBeVisible()
  await phone.close()
})

test('a vacancy whose closing date has passed is not shown to visitors', async ({
  request,
  browser,
  playwright,
  baseURL,
}) => {
  const url = baseURL ?? ''
  const word = uniqueWord('stale')
  const employer = await approvedEmployerByApi(
    playwright,
    url,
    request,
    uniqueEmail('expiry'),
    `E2E Expiry ${word}`,
  )
  const liveId = await createVacancyByApi(employer, { title: `Live ${word}` })
  const staleId = await createVacancyByApi(employer, { title: `Old ${word}` })
  const phone = await browser.newContext({ viewport: PHONE })
  const visitor = await phone.newPage()
  await visitor.goto(`/jobs?q=${word}`)
  await expect(visitor.getByText('2 jobs for')).toBeVisible()

  // The closing date goes by (the test database lets a test set it directly).
  const expired = await request.post(`/api/v1/_test/vacancies/${staleId}/expire`)
  expect(expired.status()).toBe(204)

  await visitor.reload()
  await expect(visitor.getByRole('link', { name: new RegExp(`Live ${word}`) })).toBeVisible()
  await expect(visitor.getByRole('link', { name: new RegExp(`Old ${word}`) })).toHaveCount(0)
  await expect(visitor.getByText('1 job for')).toBeVisible()
  await visitor.goto(`/jobs/${staleId}`)
  await expect(
    visitor.getByRole('heading', { name: 'This vacancy is no longer available' }),
  ).toBeVisible()
  await visitor.goto(`/jobs/${liveId}`)
  await expect(visitor.getByRole('heading', { name: `Live ${word}`, level: 1 })).toBeVisible()

  // The employer still sees it, marked as published but no longer live.
  const mine = await employer.api.get('/api/v1/employer/vacancies?page_size=50')
  const items = (
    (await mine.json()) as { data: { id: string; status: string; is_live: boolean }[] }
  ).data
  expect(items.find((item) => item.id === staleId)).toMatchObject({
    status: 'published',
    is_live: false,
  })
  await phone.close()
})

test('an employer who is not approved cannot publish, and nothing of theirs is public', async ({
  request,
  browser,
  playwright,
  baseURL,
}) => {
  const url = baseURL ?? ''
  const word = uniqueWord('pending')
  const employer = await verifiedUserByApi(playwright, url, request, uniqueEmail('unapproved'))
  const saved = await employer.api.put('/api/v1/employer/me', {
    headers: employer.headers,
    data: {
      company_name: `E2E Unapproved ${word}`,
      district_id: await firstDistrictId(employer),
    },
  })
  expect(saved.status()).toBe(200) // a draft company profile is enough to write drafts

  const id = await createVacancyByApi(employer, { title: `Hidden ${word}` }, false)
  const refused = await employer.api.post(`/api/v1/employer/vacancies/${id}/publish`, {
    headers: employer.headers,
  })
  expect(refused.status()).toBe(403)
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
    'employer_not_verified',
  )

  const visitor = await (await browser.newContext({ viewport: PHONE })).newPage()
  await visitor.goto(`/jobs?q=${word}`)
  await expect(visitor.getByText('No jobs match your search')).toBeVisible()
  await visitor.goto(`/jobs/${id}`)
  await expect(
    visitor.getByRole('heading', { name: 'This vacancy is no longer available' }),
  ).toBeVisible()
})

test('a reported vacancy can be closed by an admin and leaves the search', async ({
  request,
  browser,
  playwright,
  baseURL,
}) => {
  const url = baseURL ?? ''
  const word = uniqueWord('scam')
  const employer = await approvedEmployerByApi(
    playwright,
    url,
    request,
    uniqueEmail('reported'),
    `E2E Reported ${word}`,
  )
  const id = await createVacancyByApi(employer, { title: `Earn fast ${word}` })
  const seeker = await verifiedUserByApi(
    playwright,
    url,
    request,
    uniqueEmail('reporter'),
    'job_seeker',
  )
  const admin = await adminByApi(playwright, url)

  // The job seeker reports it; reporting twice is refused.
  const report = () =>
    seeker.api.post(`/api/v1/vacancies/${id}/reports`, {
      headers: seeker.headers,
      data: { reason: 'scam_or_fee', details: 'They asked for a registration fee.' },
    })
  expect((await report()).status()).toBe(201)
  const again = await report()
  expect(again.status()).toBe(409)
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe('already_reported')

  // Reports are for admins only.
  expect((await seeker.api.get('/api/v1/admin/reports')).status()).toBe(403)
  expect((await employer.api.get('/api/v1/admin/reports')).status()).toBe(403)

  // The admin finds it in the open reports and acts on it.
  const list = await admin.api.get('/api/v1/admin/reports?status=open&page_size=50')
  const reports = (
    (await list.json()) as {
      data: { id: string; vacancy: { id: string; is_live: boolean } }[]
    }
  ).data
  const mine = reports.find((item) => item.vacancy.id === id)
  expect(mine?.vacancy.is_live).toBe(true)
  const acted = await admin.api.post(`/api/v1/admin/reports/${mine?.id}/resolve`, {
    headers: admin.headers,
    data: { action: 'action', note: 'Confirmed.' },
  })
  expect(acted.status()).toBe(200)

  // It is gone from public search and from its own page.
  const visitor = await (await browser.newContext({ viewport: PHONE })).newPage()
  await visitor.goto(`/jobs?q=${word}`)
  await expect(visitor.getByText('No jobs match your search')).toBeVisible()
  await visitor.goto(`/jobs/${id}`)
  await expect(
    visitor.getByRole('heading', { name: 'This vacancy is no longer available' }),
  ).toBeVisible()
})
