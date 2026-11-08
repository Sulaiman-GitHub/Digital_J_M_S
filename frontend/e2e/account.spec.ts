import { expect, test } from '@playwright/test'
import { readySeekerByApi } from './api-helpers.ts'
import { PASSWORD, uniqueEmail } from './helpers.ts'

// A person can see what is held about them, and delete their account for good.

test('a student downloads their data, deletes the account, and cannot log in again', async ({
  page,
  request,
  playwright,
  baseURL,
}) => {
  const email = uniqueEmail('leaver')
  await readySeekerByApi(playwright, baseURL ?? '', request, email, 'Nakato Sarah')

  await page.goto('/login?next=%2Faccount')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible()

  // The data file contains the person's own details.
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download my data' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('my-data.json')

  // A wrong password does not delete anything.
  await page.getByRole('button', { name: 'Delete my account…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
  await dialog.getByLabel('Your password').fill('Not-The-Password-1')
  await dialog.getByRole('button', { name: 'Delete my account' }).click()
  await expect(dialog.getByText('That password is not correct.')).toBeVisible()

  // The right one does.
  await dialog.getByLabel('Your password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page.getByText('Your account was deleted.')).toBeVisible()
  await expect(page).toHaveURL('/')

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
