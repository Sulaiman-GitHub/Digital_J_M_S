import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, loggedIn, makeUser, mockApi, okData, renderRoutes } from '../../test/utils'
import { listResponse, makeCard, pageOf } from '../vacancies/testData'
import { SavedJobsPage } from './SavedJobsPage'

const LIST = 'GET /api/v1/saved-vacancies*'

function renderSaved(
  route = '/saved',
  handler: (path: string) => Response = () => listResponse(pageOf([makeCard()])),
) {
  const api = mockApi({
    ...loggedIn(makeUser({ role: 'job_seeker' })),
    'GET /api/v1/saved-vacancies/ids': () => okData({ vacancy_ids: ['v1'] }),
    [LIST]: (request) => handler(request.path),
  })
  renderRoutes(
    [
      { path: '/saved', element: <SavedJobsPage /> },
      { path: '/jobs', element: <p>Job list</p> },
      { path: '/jobs/:id', element: <p>Detail page</p> },
    ],
    { route },
  )
  return api
}

describe('SavedJobsPage', () => {
  it('shows a status while loading, then the saved jobs and how many', async () => {
    renderSaved('/saved', () =>
      listResponse(pageOf([makeCard(), makeCard({ id: 'v2', title: 'Delivery Driver' })])),
    )

    expect(screen.getByText('Loading jobs')).toBeInTheDocument()
    expect(await screen.findByText('Accounts Assistant')).toBeInTheDocument()
    expect(screen.getByText('Delivery Driver')).toBeInTheDocument()
    expect(screen.getByText('2 jobs saved')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Saved jobs', level: 1 })).toBeInTheDocument()
  })

  it('says "1 job saved" for one', async () => {
    renderSaved()

    expect(await screen.findByText('1 job saved')).toBeInTheDocument()
  })

  it('shows a friendly empty state with a way to find jobs', async () => {
    renderSaved('/saved', () => listResponse(pageOf([])))

    expect(await screen.findByText('No saved jobs yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find jobs' })).toHaveAttribute('href', '/jobs')
  })

  it('shows an error with Retry, and recovers', async () => {
    let fail = true
    renderSaved('/saved', () =>
      fail ? apiError(500, 'internal_error', 'Server error') : listResponse(pageOf([makeCard()])),
    )

    expect(await screen.findByText('Could not load your saved jobs')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Accounts Assistant')).toBeInTheDocument()
  })

  it('asks for the page in the address, and shows page buttons for the total', async () => {
    const api = renderSaved('/saved?page=2', () =>
      listResponse(pageOf([makeCard({ id: 'v9', title: 'Page two job' })], 45, 2)),
    )

    expect(await screen.findByText('Page two job')).toBeInTheDocument()
    await waitFor(() => expect(api.calls.some((call) => call.path.includes('page=2'))).toBe(true))
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument()
  })

  it('each card has a filled bookmark for what is saved', async () => {
    renderSaved()

    expect(
      await screen.findByRole('button', { name: 'Remove from saved jobs: Accounts Assistant' }),
    ).toBeInTheDocument()
  })
})
