import { expect, test, type Page } from '@playwright/test'
import {
  applyByApi,
  approvedEmployerByApi,
  createVacancyByApi,
  pdfBytes,
  readySeekerByApi,
  uniqueWord,
} from './api-helpers.ts'
import { PASSWORD, uniqueEmail } from './helpers.ts'

// Phase 5 journey and gate: an employer publishes, a student finds the vacancy
// on a phone and applies, the employer moves the application on, the student sees it, and the
// rules hold: an invalid move is refused and another employer cannot reach the application.

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

test('a student applies on a phone, the employer shortlists, and the student sees it', async ({
  request,
  browser,
  playwright,
  baseURL,
}) => {
  const url = baseURL ?? ''
  const word = uniqueWord('journey')
  const title = `Junior ${word}`

  // 1. An approved employer has a live vacancy.
  const hirerEmail = uniqueEmail('hirer')
  const employer = await approvedEmployerByApi(
    playwright,
    url,
    request,
    hirerEmail,
    `E2E Hirer ${word}`,
  )
  const vacancyId = await createVacancyByApi(employer, { title })

  // 2. A student is ready: verified, profile, CV, consent.
  const studentEmail = uniqueEmail('applicant')
  await readySeekerByApi(playwright, url, request, studentEmail, 'Nakato Sarah')

  // 3. On a 360 px phone the student finds the vacancy and applies.
  const phone = await browser.newContext({ viewport: PHONE })
  const student = await phone.newPage()
  await logIn(student, studentEmail)
  await student.goto(`/jobs?q=${word}`)
  const card = student.getByRole('link', { name: new RegExp(title) })
  await expect(card).toBeVisible()
  await card.click()
  await student.getByRole('link', { name: 'Apply', exact: true }).click()
  await expect(student.getByRole('heading', { name: 'What will be sent' })).toBeVisible()
  await expect(student.getByText(/my-cv\.pdf/)).toBeVisible()
  expect(await noSideScroll(student)).toBe(true)
  await student.getByLabel('Cover note (optional)').fill('I would love to join your team.')
  await student.getByRole('button', { name: 'Send application' }).click()
  await expect(student.getByRole('heading', { name: 'Application sent' })).toBeVisible()
  expect(await noSideScroll(student)).toBe(true)

  // The vacancy page now says Applied, and there is no second Apply button.
  await student.goto(`/jobs/${vacancyId}`)
  await expect(student.getByText('Applied', { exact: true })).toBeVisible()
  await expect(student.getByRole('link', { name: 'Apply', exact: true })).toHaveCount(0)

  // 4. The employer sees the application and moves it on to shortlisted.
  const hirerContext = await browser.newContext()
  const hirer = await hirerContext.newPage()
  await logIn(hirer, hirerEmail)
  await hirer.goto('/employer')
  const row = hirer.getByRole('listitem').filter({ hasText: title })
  const applicantsLink = row.getByRole('link', { name: `Applicants for ${title}` })
  await expect(applicantsLink).toHaveText('1 applicant')
  await expect(row.getByText('1 new')).toBeVisible()
  await applicantsLink.click()
  await hirer.getByRole('link', { name: /Nakato Sarah/ }).click()
  await expect(hirer.getByRole('heading', { name: 'Nakato Sarah', level: 1 })).toBeVisible()
  await expect(hirer.getByText('I would love to join your team.')).toBeVisible()

  // The CV is the copy the student sent.
  const cvPath = await hirer.getByRole('link', { name: /Download CV/ }).getAttribute('href')
  const cv = await hirer.request.get(cvPath ?? '')
  expect(cv.status()).toBe(200)
  expect(cv.headers()['content-type']).toBe('application/pdf')
  expect(await cv.body()).toEqual(pdfBytes(studentEmail))

  // Only the allowed next statuses are offered; Offered is not one of them.
  await expect(hirer.getByRole('radio', { name: 'Under review' })).toBeVisible()
  await expect(hirer.getByRole('radio', { name: 'Offered' })).toHaveCount(0)
  await hirer.getByRole('radio', { name: 'Under review' }).check()
  await hirer.getByRole('button', { name: 'Update status' }).click()
  await expect(hirer.getByText('Moved to Under review.')).toBeVisible()
  await hirer.getByRole('radio', { name: 'Shortlisted' }).check()
  await hirer.getByLabel('Note (optional)').fill('Please bring your certificates.')
  await hirer.getByRole('button', { name: 'Update status' }).click()
  await expect(hirer.getByText('Moved to Shortlisted.')).toBeVisible()

  // 5. The student sees Shortlisted and the history.
  await student.goto('/applications')
  const mine = student.getByRole('link', { name: new RegExp(title) })
  await expect(mine.getByText('Shortlisted')).toBeVisible()
  await mine.click()
  const steps = student.getByRole('list', { name: 'Application history' }).getByRole('listitem')
  await expect(steps).toHaveCount(3)
  await expect(steps.nth(0)).toContainText('Shortlisted')
  await expect(steps.nth(0)).toContainText('Please bring your certificates.')
  await expect(steps.nth(1)).toContainText('Under review')
  await expect(steps.nth(2)).toContainText('Submitted')
  expect(await noSideScroll(student)).toBe(true)

  // The student can withdraw, after confirming.
  await student.getByRole('button', { name: 'Withdraw application…' }).click()
  await student.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click()
  await expect(student.getByText('Application withdrawn.')).toBeVisible()
  await expect(student.getByRole('button', { name: 'Withdraw application…' })).toHaveCount(0)
  await phone.close()
  await hirerContext.close()
})

test('an invalid move is refused, and another employer cannot reach the application', async ({
  request,
  playwright,
  baseURL,
}) => {
  const url = baseURL ?? ''
  const word = uniqueWord('guard')
  const owner = await approvedEmployerByApi(
    playwright,
    url,
    request,
    uniqueEmail('owner'),
    `E2E Owner ${word}`,
  )
  const rival = await approvedEmployerByApi(
    playwright,
    url,
    request,
    uniqueEmail('rival'),
    `E2E Rival ${word}`,
  )
  const vacancyId = await createVacancyByApi(owner, { title: `Guarded ${word}` })
  const seeker = await readySeekerByApi(playwright, url, request, uniqueEmail('guarded'))
  const applicationId = await applyByApi(seeker, vacancyId)

  // Submitted to Offered skips the steps in between.
  const refused = await owner.api.post(`/api/v1/employer/applications/${applicationId}/status`, {
    headers: owner.headers,
    data: { status: 'offered' },
  })
  expect(refused.status()).toBe(409)
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
    'invalid_status_transition',
  )

  // The applicant cannot set an employer status.
  const forged = await seeker.api.post(`/api/v1/employer/applications/${applicationId}/status`, {
    headers: seeker.headers,
    data: { status: 'shortlisted' },
  })
  expect(forged.status()).toBe(403)

  // A second employer gets "not found" for the application, its status, its CV and its list.
  for (const response of [
    await rival.api.get(`/api/v1/applications/${applicationId}`),
    await rival.api.get(`/api/v1/employer/applications/${applicationId}/cv`),
    await rival.api.post(`/api/v1/employer/applications/${applicationId}/status`, {
      headers: rival.headers,
      data: { status: 'under_review' },
    }),
    await rival.api.get(`/api/v1/employer/vacancies/${vacancyId}/applications`),
  ]) {
    expect(response.status()).toBe(404)
  }

  // Nothing changed.
  const detail = await owner.api.get(`/api/v1/applications/${applicationId}`)
  expect(((await detail.json()) as { data: { status: string } }).data.status).toBe('submitted')
})
