import { expect, test, type Page } from '@playwright/test'
import {
  approvedEmployerByApi,
  createVacancyByApi,
  readySeekerByApi,
  uniqueWord,
} from './api-helpers.ts'
import { PASSWORD, uniqueEmail } from './helpers.ts'

// Saved jobs: a student bookmarks a job on a phone, finds it on the Saved
// screen, removes it, and a visitor never sees a bookmark.

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

test('a student saves a job on a phone, sees it under Saved jobs and removes it', async ({
  request,
  browser,
  playwright,
  baseURL,
}) => {
  const url = baseURL ?? ''
  const word = uniqueWord('saver')
  const title = `Cashier ${word}`
  const employer = await approvedEmployerByApi(
    playwright,
    url,
    request,
    uniqueEmail('shop'),
    `E2E Shop ${word}`,
  )
  await createVacancyByApi(employer, { title })
  const studentEmail = uniqueEmail('saver')
  await readySeekerByApi(playwright, url, request, studentEmail, 'Nakato Sarah')

  // A visitor sees the job but no bookmark.
  const visitorContext = await browser.newContext({ viewport: PHONE })
  const visitor = await visitorContext.newPage()
  await visitor.goto(`/jobs?q=${word}`)
  await expect(visitor.getByRole('link', { name: new RegExp(title) })).toBeVisible()
  await expect(visitor.getByRole('button', { name: /Save job/ })).toHaveCount(0)
  await visitorContext.close()

  // The student saves it from the list.
  const phone = await browser.newContext({ viewport: PHONE })
  const student = await phone.newPage()
  await logIn(student, studentEmail)
  await student.goto(`/jobs?q=${word}`)
  const save = student.getByRole('button', { name: `Save job: ${title}` })
  await expect(save).toBeVisible()
  await save.click()
  await expect(
    student.getByRole('button', { name: `Remove from saved jobs: ${title}` }),
  ).toHaveAttribute('aria-pressed', 'true')

  // It is under Saved jobs, also after a reload (it is stored on the server).
  await student
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Saved' })
    .click()
  await expect(student.getByRole('heading', { name: 'Saved jobs', level: 1 })).toBeVisible()
  await expect(student.getByRole('link', { name: new RegExp(title) })).toBeVisible()
  expect(await noSideScroll(student)).toBe(true)
  await student.reload()
  await expect(student.getByRole('link', { name: new RegExp(title) })).toBeVisible()

  // Removing it empties the list.
  await student.getByRole('button', { name: `Remove from saved jobs: ${title}` }).click()
  await expect(student.getByText('No saved jobs yet')).toBeVisible()
  await student.reload()
  await expect(student.getByText('No saved jobs yet')).toBeVisible()

  await phone.close()
})
