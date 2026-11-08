import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ApplicationDetail, ApplicationItem } from '../../api/types'
import {
  apiError,
  jsonResponse,
  loggedIn,
  makeUser,
  mockApi,
  okData,
  renderRoutes,
} from '../../test/utils'
import { ApplicationDetailPage } from './ApplicationDetailPage'
import { ApplicationsPage } from './ApplicationsPage'
import { makeApplication, makeHistory, makeItem } from './testData'

type Routes = Parameters<typeof mockApi>[0]

function renderList(items: ApplicationItem[] | (() => Response), total = items.length) {
  const api = mockApi({
    ...loggedIn(makeUser({ role: 'job_seeker' })),
    'GET /api/v1/applications/me*':
      typeof items === 'function'
        ? items
        : () => jsonResponse({ data: items, meta: { page: 1, page_size: 20, total } }),
  } as Routes)
  const view = renderRoutes(
    [
      { path: '/applications', element: <ApplicationsPage /> },
      { path: '/applications/:id', element: <p>Application page</p> },
      { path: '/jobs', element: <p>Jobs</p> },
    ],
    { route: '/applications' },
  )
  return { api, ...view }
}

describe('the list', () => {
  it('shows each application with its status and dates', async () => {
    renderList([
      makeItem({
        id: 'a1',
        status: 'shortlisted',
        updated_at: '2026-11-06T10:12:00Z',
      }),
      makeItem({
        id: 'a2',
        status: 'withdrawn',
        vacancy: {
          id: 'v2',
          title: 'Sales Intern',
          company_name: 'Mbarara Traders',
          status: 'closed',
          is_live: false,
        },
      }),
    ])

    const first = await screen.findByRole('link', { name: /Accounts Assistant/ })

    expect(first).toHaveAttribute('href', '/applications/a1')
    expect(within(first).getByText('Shortlisted')).toBeVisible()
    expect(first).toHaveTextContent('Ssese Foods Ltd')
    expect(first).toHaveTextContent('Applied 4 Nov 2026')
    expect(first).toHaveTextContent('Updated 6 Nov 2026')
    const second = screen.getByRole('link', { name: /Sales Intern/ })
    expect(within(second).getByText('Withdrawn')).toBeVisible()
    expect(second).toHaveTextContent('Vacancy closed')
    expect(screen.getByText('2 applications')).toBeVisible()
  })

  it('shows a status while loading', () => {
    renderList(() => new Response(null))

    expect(screen.getByText('Loading your applications')).toBeInTheDocument()
  })

  it('shows an empty state with a way on', async () => {
    renderList([])

    expect(await screen.findByText('You have not applied for any jobs yet')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Find jobs' })).toHaveAttribute('href', '/jobs')
  })

  it('shows Retry after an error, and recovers', async () => {
    let fail = true
    renderList(() =>
      fail
        ? apiError(500, 'server_error', 'Oops')
        : jsonResponse({ data: [makeItem()], meta: { page: 1, page_size: 20, total: 1 } }),
    )

    expect(await screen.findByText('Could not load your applications')).toBeVisible()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('link', { name: /Accounts Assistant/ })).toBeVisible()
  })

  it('pages through long lists', async () => {
    const { api } = renderList([makeItem()], 45)

    await userEvent.click(await screen.findByRole('button', { name: /Page 2|2/ }))

    await waitFor(() => expect(api.calls.some((call) => call.path.includes('page=2'))).toBe(true))
  })
})

const DETAIL = 'GET /api/v1/applications/a1'
const WITHDRAW = 'POST /api/v1/applications/a1/withdraw'

function renderDetail(
  application: ApplicationDetail | (() => Response) = makeApplication(),
  routes: Record<string, unknown> = {},
) {
  const api = mockApi({
    ...loggedIn(makeUser({ role: 'job_seeker' })),
    [DETAIL]: typeof application === 'function' ? application : () => okData(application),
    ...routes,
  } as Routes)
  const view = renderRoutes(
    [
      { path: '/applications/:id', element: <ApplicationDetailPage /> },
      { path: '/applications', element: <p>List page</p> },
      { path: '/jobs/:id', element: <p>Vacancy page</p> },
    ],
    { route: '/applications/a1' },
  )
  return { api, ...view }
}

const history = makeHistory(
  ['submitted', '2026-11-04T09:02:00Z'],
  ['under_review', '2026-11-05T15:40:00Z'],
  ['shortlisted', '2026-11-06T10:12:00Z', 'Please bring your certificates.'],
)

describe('one application', () => {
  it('shows the status and the history, newest first, with the employer note', async () => {
    renderDetail(makeApplication({ status: 'shortlisted', history }))

    const timeline = await screen.findByRole('list', { name: 'Application history' })
    const steps = within(timeline).getAllByRole('listitem')

    expect(
      steps.map((step) => step.textContent?.match(/Shortlisted|Under review|Submitted/)?.[0]),
    ).toEqual(['Shortlisted', 'Under review', 'Submitted'])
    expect(steps[0]).toHaveTextContent('Please bring your certificates.')
    expect(screen.getByRole('heading', { name: 'Accounts Assistant', level: 1 })).toBeVisible()
    expect(screen.getByRole('link', { name: 'See the vacancy' })).toHaveAttribute(
      'href',
      '/jobs/v1',
    )
  })

  it('shows what was sent', async () => {
    renderDetail()

    expect(await screen.findByText('CV: nakato-cv.pdf')).toBeVisible()
    expect(screen.getByText('I finished my accounting degree in July.')).toBeVisible()
  })

  it('does not link to a vacancy that is no longer live', async () => {
    renderDetail(
      makeApplication({
        vacancy: { ...makeItem().vacancy, status: 'closed', is_live: false },
      }),
    )
    await screen.findByRole('heading', { name: 'Accounts Assistant', level: 1 })

    expect(screen.queryByRole('link', { name: 'See the vacancy' })).not.toBeInTheDocument()
  })

  it('says so when the application is not found (404)', async () => {
    renderDetail(() => apiError(404, 'application_not_found', 'No such application.'))

    expect(
      await screen.findByRole('heading', { name: 'We could not find this application' }),
    ).toBeVisible()
  })

  it('shows Retry after a server error', async () => {
    renderDetail(() => apiError(500, 'server_error', 'Oops'))

    expect(await screen.findByText('Could not load this application')).toBeVisible()
  })

  it.each(['rejected', 'withdrawn'] as const)('offers no Withdraw when %s', async (status) => {
    renderDetail(makeApplication({ status, next_statuses: [] }))
    await screen.findByRole('heading', { name: 'Accounts Assistant', level: 1 })

    expect(screen.queryByRole('button', { name: /Withdraw/ })).not.toBeInTheDocument()
  })
})

describe('withdrawing', () => {
  it('asks first, and changes nothing if the person keeps the application', async () => {
    const { api } = renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw application…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw this application?' })

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep application' }))

    expect(api.callsTo('POST', '/api/v1/applications/a1/withdraw')).toHaveLength(0)
  })

  it('withdraws, shows the new status and the history, and removes the button', async () => {
    const withdrawn = makeApplication({
      status: 'withdrawn',
      next_statuses: [],
      history: makeHistory(
        ['submitted', '2026-11-04T09:02:00Z'],
        ['withdrawn', '2026-11-06T11:00:00Z'],
      ),
    })
    const { api } = renderDetail(makeApplication(), { [WITHDRAW]: () => okData(withdrawn) })
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw application…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw this application?' })

    await userEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }))

    expect(await screen.findByText('Application withdrawn.')).toBeVisible()
    expect(api.callsTo('POST', '/api/v1/applications/a1/withdraw')).toHaveLength(1)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Withdraw application…' }),
      ).not.toBeInTheDocument(),
    )
    const timeline = screen.getByRole('list', { name: 'Application history' })
    expect(within(timeline).getAllByRole('listitem')[0]).toHaveTextContent('Withdrawn')
  })

  it('shows the problem inside the dialog when withdrawing is refused', async () => {
    renderDetail(makeApplication(), {
      [WITHDRAW]: () =>
        apiError(
          409,
          'invalid_status_transition',
          'An application cannot move from rejected to withdrawn.',
        ),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw application…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Withdraw this application?' })

    await userEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }))

    expect(await within(dialog).findByText(/cannot move from rejected to withdrawn/)).toBeVisible()
  })
})
