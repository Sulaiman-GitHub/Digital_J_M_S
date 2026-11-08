import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { UserRole } from '../../api/types'
import {
  apiError,
  loggedIn,
  loggedOut,
  makeUser,
  mockApi,
  okData,
  renderWithAuth,
} from '../../test/utils'
import { BookmarkButton } from './BookmarkButton'

const IDS = 'GET /api/v1/saved-vacancies/ids'
const PUT = 'PUT /api/v1/saved-vacancies/v1'
const DELETE = 'DELETE /api/v1/saved-vacancies/v1'
const noContent = () => new Response(null, { status: 204 })

function setup(options: { role?: UserRole | null; saved?: string[]; put?: () => Response } = {}) {
  let saved = options.saved ?? []
  const api = mockApi({
    ...(options.role === null
      ? loggedOut
      : loggedIn(makeUser({ role: options.role ?? 'job_seeker' }))),
    [IDS]: () => okData({ vacancy_ids: saved }),
    [PUT]: () => {
      const response = options.put?.() ?? noContent()
      if (response.status < 300) saved = ['v1']
      return response
    },
    [DELETE]: () => {
      saved = []
      return noContent()
    },
  })
  renderWithAuth(<BookmarkButton vacancyId="v1" title="Accounts Assistant" />)
  return api
}

describe('BookmarkButton', () => {
  it.each([null, 'employer', 'admin'] as const)(
    'is not shown to %s (and the saved list is never asked for)',
    async (role) => {
      const api = setup({ role })

      await waitFor(() => expect(api.calls.length).toBeGreaterThan(0))
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(api.calls.some((call) => call.path.includes('saved-vacancies'))).toBe(false)
    },
  )

  it('offers to save a job seeker an unsaved job, and saves it at once', async () => {
    const api = setup()

    const button = await screen.findByRole('button', { name: 'Save job: Accounts Assistant' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)

    expect(
      await screen.findByRole('button', { name: 'Remove from saved jobs: Accounts Assistant' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(api.callsTo('PUT', '/api/v1/saved-vacancies/v1')).toHaveLength(1))
  })

  it('shows a saved job as saved, and removes it on a second tap', async () => {
    const api = setup({ saved: ['v1'] })

    const button = await screen.findByRole('button', {
      name: 'Remove from saved jobs: Accounts Assistant',
    })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(button)

    expect(
      await screen.findByRole('button', { name: 'Save job: Accounts Assistant' }),
    ).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(api.callsTo('DELETE', '/api/v1/saved-vacancies/v1')).toHaveLength(1))
  })

  it('goes back and says so when the server refuses (a job that has closed)', async () => {
    setup({ put: () => apiError(404, 'vacancy_not_found', 'This vacancy does not exist.') })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Save job: Accounts Assistant' }),
    )

    expect(await screen.findByText('This job is no longer open.')).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Save job: Accounts Assistant' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the limit message when the saved list is full', async () => {
    setup({
      put: () =>
        apiError(409, 'saved_limit', 'You can save up to 200 jobs. Remove some to save more.'),
    })

    await userEvent.click(
      await screen.findByRole('button', { name: 'Save job: Accounts Assistant' }),
    )

    expect(await screen.findByText(/You can save up to 200 jobs/)).toBeInTheDocument()
  })

  it('has a text version for the vacancy page', async () => {
    mockApi({
      ...loggedIn(makeUser({ role: 'job_seeker' })),
      [IDS]: () => okData({ vacancy_ids: ['v1'] }),
    })
    renderWithAuth(<BookmarkButton vacancyId="v1" title="Accounts Assistant" variant="text" />)

    expect(await screen.findByRole('button', { name: 'Saved' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
