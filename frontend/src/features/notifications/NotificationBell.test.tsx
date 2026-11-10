import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { jsonResponse, loggedIn, makeUser, mockApi, renderRoutes } from '../../test/utils'
import { makeItem } from '../applications/testData'
import { makeProfile } from '../profile/testData'
import { NotificationBell } from './NotificationBell'

type Routes = Parameters<typeof mockApi>[0]

afterEach(() => localStorage.clear())

function renderBell(options: { items?: ReturnType<typeof makeItem>[]; verified?: boolean } = {}) {
  const items = options.items ?? [
    makeItem({ id: 'a1', status: 'shortlisted', updated_at: '2026-11-09T10:00:00Z' }),
  ]
  mockApi({
    ...loggedIn(makeUser({ role: 'job_seeker', email_verified: options.verified ?? true })),
    'GET /api/v1/applications/me*': () =>
      jsonResponse({ data: items, meta: { page: 1, page_size: 20, total: items.length } }),
    'GET /api/v1/profile/me': () => jsonResponse({ data: makeProfile() }),
  } as Routes)
  return renderRoutes(
    [
      { path: '/', element: <NotificationBell /> },
      { path: '/applications/:id', element: <p>Application page</p> },
    ],
    { route: '/' },
  )
}

describe('NotificationBell', () => {
  it('shows how many updates are unread', async () => {
    renderBell()
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible()
  })

  it('lists the update and opens the application from it', async () => {
    renderBell()
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))

    const panel = screen.getByRole('region', { name: 'Notifications' })
    expect(within(panel).getByText('Ssese Foods Ltd: Shortlisted')).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('link', { name: /Shortlisted/ }))

    expect(await screen.findByText('Application page')).toBeInTheDocument()
  })

  it('marks everything as read and remembers it for this user', async () => {
    renderBell()
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument()
    expect(
      localStorage.getItem('djm-notifications-seen:26560d50-fdab-436a-8af3-07affd11269f'),
    ).toBeTruthy()
  })

  it('keeps reminding about an unverified email, which marking as read does not clear', async () => {
    renderBell({ items: [], verified: false })
    await userEvent.click(await screen.findByRole('button', { name: /^Notifications/ }))

    expect(screen.getByText('Verify your email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
  })

  it('says so when there is nothing new, and closes with Escape', async () => {
    renderBell({ items: [] })
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(screen.getByText(/all caught up/)).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByText(/all caught up/)).not.toBeInTheDocument())
  })
})
