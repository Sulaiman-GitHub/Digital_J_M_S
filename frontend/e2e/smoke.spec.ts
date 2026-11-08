import { expect, test } from '@playwright/test'

test('home page loads with the app header and main heading', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Digital Job Matching System')
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Digital Job Matching System' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('unknown routes show the not found page', async ({ page }) => {
  await page.goto('/this-page-does-not-exist')

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})
