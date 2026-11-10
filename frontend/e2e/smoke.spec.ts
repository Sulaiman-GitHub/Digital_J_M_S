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

// CI draws text with a wider fallback font than a developer's PC, so check with a wide one too.
for (const path of ['/', '/jobs']) {
  test(`${path} does not scroll sideways on a 360 px phone, even with a wide font`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 } })
    const page = await context.newPage()
    await page.goto(path)
    await page.addStyleTag({
      content: '* { font-family: Verdana, "DejaVu Sans", sans-serif !important; }',
    })
    await expect(page.getByRole('banner')).toBeVisible()

    const widths = await page
      .locator('html')
      .evaluate((root) => ({ scroll: root.scrollWidth, client: root.clientWidth }))

    expect(widths.scroll).toBeLessThanOrEqual(widths.client)
    await context.close()
  })
}
