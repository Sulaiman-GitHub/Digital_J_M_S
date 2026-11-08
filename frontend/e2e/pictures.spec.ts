import { expect, test, type Page } from '@playwright/test'
import {
  applyByApi,
  approvedEmployerByApi,
  createVacancyByApi,
  readySeekerByApi,
  uniqueWord,
} from './api-helpers.ts'
import { PASSWORD, uniqueEmail } from './helpers.ts'

// Photos and logos: a student adds a photo that shows in the header and to the
// employer they applied to; an employer adds a logo that the public sees on the vacancy.

// A real 1x1 PNG, so the browser can actually draw it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function logIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

// Waits until the browser has really drawn an image whose address contains `src`.
const drawn = (page: Page, src: string) =>
  page.waitForFunction(
    `Array.from(document.images).some((img) => img.src.includes(${JSON.stringify(src)}) && img.complete && img.naturalWidth > 0)`,
  )

test('a student adds a photo and the employer they applied to sees it', async ({
  request,
  browser,
  playwright,
  baseURL,
}) => {
  const url = baseURL ?? ''
  const word = uniqueWord('photo')
  const hirerEmail = uniqueEmail('hirer')
  const employer = await approvedEmployerByApi(
    playwright,
    url,
    request,
    hirerEmail,
    `E2E Hirer ${word}`,
  )
  const vacancyId = await createVacancyByApi(employer, { title: `Clerk ${word}` })
  const studentEmail = uniqueEmail('photo')
  const student = await readySeekerByApi(playwright, url, request, studentEmail, 'Nakato Sarah')
  const applicationId = await applyByApi(student, vacancyId)

  // The student adds a photo on the profile page.
  const context = await browser.newContext()
  const page = await context.newPage()
  await logIn(page, studentEmail)
  await page.goto('/profile')
  await page.getByRole('button', { name: /^CV and consent/ }).click()
  await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible()
  await page
    .getByLabel('Profile photo file')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByText('Your photo is saved.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible()
  await drawn(page, '/api/v1/photo/me/image') // the account button and the form both show it

  // It is still there after a reload, and it can be removed.
  await page.reload()
  await page.getByRole('button', { name: /^CV and consent/ }).click()
  await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible()

  // The employer sees the photo on the applicant page; nobody else is offered it.
  const employerContext = await browser.newContext()
  const hirer = await employerContext.newPage()
  await logIn(hirer, hirerEmail)
  await hirer.goto(`/employer/applications/${applicationId}`)
  await drawn(hirer, `/api/v1/employer/applications/${applicationId}/photo`)
  const photo = await hirer.request.get(`/api/v1/employer/applications/${applicationId}/photo`)
  expect(photo.status()).toBe(200)
  expect(photo.headers()['content-type']).toBe('image/png')

  const visitor = await browser.newContext()
  const anonymous = await visitor.request.get(
    `/api/v1/employer/applications/${applicationId}/photo`,
  )
  expect(anonymous.status()).toBe(401)

  await page.getByRole('button', { name: 'Remove photo' }).click()
  await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible()

  await context.close()
  await employerContext.close()
  await visitor.close()
})

test('an employer adds a logo that the public sees on the vacancy', async ({
  request,
  browser,
  playwright,
  baseURL,
}) => {
  const url = baseURL ?? ''
  const word = uniqueWord('logo')
  const hirerEmail = uniqueEmail('hirer')
  const employer = await approvedEmployerByApi(
    playwright,
    url,
    request,
    hirerEmail,
    `E2E Shop ${word}`,
  )
  const vacancyId = await createVacancyByApi(employer, { title: `Cashier ${word}` })

  const context = await browser.newContext()
  const page = await context.newPage()
  await logIn(page, hirerEmail)
  await page.goto('/employer/profile')
  await expect(page.getByRole('button', { name: 'Choose a logo' })).toBeVisible()
  await page
    .getByLabel('Company logo file')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByText('Your logo is saved.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replace logo' })).toBeVisible()

  // A visitor sees it on the job list and on the vacancy page.
  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()
  await visitor.goto(`/jobs?q=${word}`)
  await expect(visitor.getByRole('link', { name: new RegExp(`Cashier ${word}`) })).toBeVisible()
  await drawn(visitor, `/api/v1/vacancies/${vacancyId}/logo`)
  const logo = await visitor.request.get(`/api/v1/vacancies/${vacancyId}/logo`)
  expect(logo.status()).toBe(200)
  expect(logo.headers()['content-type']).toBe('image/png')

  await context.close()
  await visitorContext.close()
})
