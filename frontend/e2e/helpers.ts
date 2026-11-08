import { expect, type APIRequestContext } from '@playwright/test'

export const PASSWORD = 'Kampala-Sunrise-42'
export const NEW_PASSWORD = 'Mbarara-Hills-77'

// The admin that e2e/global-setup.ts creates in the *_test database before the tests start.
export const ADMIN_EMAIL = 'e2e.admin@example.com'
export const ADMIN_PASSWORD = 'Kampala-Sunrise-42'

/** A fresh address per test, so runs never collide in the shared test database. */
export function uniqueEmail(label = 'user'): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `e2e.${label}.${Date.now()}.${random}@example.com`
}

export interface InboxMessage {
  to: string
  subject: string
  text_body: string
  html_body: string | null
}

/**
 * Wait for the app to "send" an email (test-only inbox, available when the backend runs with
 * APP_ENV=test) and return the newest one with that subject.
 */
export async function waitForEmail(
  request: APIRequestContext,
  to: string,
  subject: string,
  timeoutMs = 10_000,
): Promise<InboxMessage> {
  let found: InboxMessage | undefined
  await expect
    .poll(
      async () => {
        const response = await request.get('/api/v1/_test/emails', { params: { to } })
        if (response.status() === 404) {
          throw new Error(
            'The test inbox is missing: the backend is not running with APP_ENV=test.',
          )
        }
        const { data } = (await response.json()) as { data: InboxMessage[] }
        found = data.filter((message) => message.subject === subject).at(-1)
        return found !== undefined
      },
      { message: `an email "${subject}" to ${to}`, timeout: timeoutMs },
    )
    .toBe(true)
  return found as InboxMessage
}

/** The first link in an email, as a path on the site (works whatever FRONTEND_BASE_URL is). */
export function linkPath(message: InboxMessage): string {
  const match = message.text_body.match(/https?:\/\/\S+/)
  if (!match) throw new Error(`No link in the email "${message.subject}"`)
  const url = new URL(match[0])
  return `${url.pathname}${url.search}`
}
