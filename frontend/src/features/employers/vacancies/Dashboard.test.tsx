import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ManagedVacancy } from '../../../api/types'
import { apiError, loggedIn, makeUser, mockApi, okData, renderRoutes } from '../../../test/utils'
import { EmployerDashboardPage } from '../EmployerDashboardPage'
import { EMPLOYER_PATH, employerRoutes } from '../testData'
import { MINE, listOf, makeManaged, vacancyRoutes } from './testData'

type Routes = Parameters<typeof mockApi>[0]

function renderDashboard(routes: Record<string, unknown>, route = '/employer') {
  const api = mockApi(routes as Routes)
  const view = renderRoutes(
    [
      { path: '/employer', element: <EmployerDashboardPage /> },
      { path: '/employer/profile', element: <p>Profile page</p> },
      { path: '/employer/vacancies/new', element: <p>New vacancy page</p> },
      { path: '/employer/vacancies/:id', element: <p>Edit vacancy page</p> },
    ],
    { route },
  )
  return { api, ...view }
}

const listCalls = (api: ReturnType<typeof renderDashboard>['api']) =>
  api.calls
    .filter((call) => call.path.startsWith('/api/v1/employer/vacancies?'))
    .map((call) => new URLSearchParams(call.path.split('?')[1]))

const live = makeManaged({
  id: 'live',
  title: 'Live job',
  status: 'published',
  is_live: true,
  published_at: '2026-11-01T09:00:00Z',
  expires_at: '2026-11-28T20:59:00Z',
})
const draft = makeManaged({ id: 'draft', title: 'Draft job', status: 'draft' })
const expired = makeManaged({
  id: 'expired',
  title: 'Expired job',
  status: 'published',
  is_live: false,
  published_at: '2026-09-01T09:00:00Z',
  expires_at: '2026-10-30T20:59:00Z',
})
const closed = makeManaged({ id: 'closed', title: 'Closed job', status: 'closed' })

describe('the list', () => {
  it('shows a status, then each vacancy with its badge and dates', async () => {
    renderDashboard(vacancyRoutes('approved', [live, draft, expired, closed]))

    expect(screen.getByText('Loading your vacancies')).toBeInTheDocument()
    expect(await screen.findByText('Live job')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('Live')
    expect(rows[0]).toHaveTextContent('Closes 28 Nov 2026')
    expect(rows[1]).toHaveTextContent('Draft')
    expect(rows[1]).toHaveTextContent('Not published yet')
    expect(rows[2]).toHaveTextContent('Expired')
    expect(rows[2]).toHaveTextContent('Closed to applicants on 30 Oct 2026')
    expect(rows[3]).toHaveTextContent('Closed')
    expect(screen.getByText('4 vacancies')).toBeInTheDocument()
  })

  it('shows the company with its status, and links to the profile and a new vacancy', async () => {
    renderDashboard(vacancyRoutes('approved', [live]))

    expect(await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Company profile' })).toHaveAttribute(
      'href',
      '/employer/profile',
    )
    expect(screen.getByRole('link', { name: 'New vacancy' })).toHaveAttribute(
      'href',
      '/employer/vacancies/new',
    )
  })

  it('Edit leads to the form, and a closed vacancy has no actions', async () => {
    renderDashboard(vacancyRoutes('approved', [live, closed]))
    await screen.findByText('Live job')
    const [liveRow, closedRow] = screen.getAllByRole('listitem')

    expect(within(liveRow).getByRole('link', { name: 'Edit Live job' })).toHaveAttribute(
      'href',
      '/employer/vacancies/live',
    )
    expect(within(closedRow).queryByRole('link', { name: /^Edit/ })).not.toBeInTheDocument()
    expect(within(closedRow).queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows how many applicants each published vacancy has, and how many are new', async () => {
    renderDashboard(
      vacancyRoutes('approved', [
        { ...live, application_count: 12, new_application_count: 3 },
        { ...closed, application_count: 1, new_application_count: 0 },
      ]),
    )
    await screen.findByText('Live job')
    const [liveRow, closedRow] = screen.getAllByRole('listitem')

    const link = within(liveRow).getByRole('link', { name: 'Applicants for Live job' })
    expect(link).toHaveTextContent('12 applicants')
    expect(link).toHaveAttribute('href', '/employer/vacancies/live/applicants')
    expect(within(liveRow).getByText('3 new')).toBeVisible()
    expect(within(closedRow).getByRole('link', { name: /Applicants for/ })).toHaveTextContent(
      '1 applicant',
    )
    expect(within(closedRow).queryByText(/new$/)).not.toBeInTheDocument()
  })

  it('has an empty state that invites the first vacancy', async () => {
    renderDashboard(vacancyRoutes('approved', []))

    expect(await screen.findByText('No vacancies yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'New vacancy' }).length).toBeGreaterThan(0)
  })

  it('shows an error with Retry, and recovers', async () => {
    let fail = true
    renderDashboard({
      ...vacancyRoutes('approved'),
      [MINE]: () => (fail ? apiError(500, 'internal_error', 'Server error') : listOf([live])),
    })

    expect(await screen.findByText('Could not load your vacancies')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Live job')).toBeInTheDocument()
  })

  it('asks for the company profile first when there is none', async () => {
    renderDashboard({
      ...vacancyRoutes('approved'),
      [EMPLOYER_PATH]: () => apiError(404, 'employer_not_found', 'none'),
    })

    expect(await screen.findByText('Set up your company profile first')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New vacancy' })).not.toBeInTheDocument()
  })
})

describe('filters and pages', () => {
  it('filters by status through the address and the request', async () => {
    const { api, router } = renderDashboard(vacancyRoutes('approved', [live]))
    await screen.findByText('Live job')
    expect(listCalls(api)[0].has('status')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Drafts' }))

    await waitFor(() => expect(listCalls(api).at(-1)!.get('status')).toBe('draft'))
    expect(router.state.location.search).toBe('?status=draft')
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('starts from the status in the address', async () => {
    const { api } = renderDashboard(vacancyRoutes('approved', [closed]), '/employer?status=closed')
    await screen.findByText('Closed job')

    expect(listCalls(api)[0].get('status')).toBe('closed')
    expect(screen.getByRole('button', { name: 'Closed', pressed: true })).toBeVisible()
  })

  it('has a friendly message for an empty filter', async () => {
    renderDashboard(vacancyRoutes('approved', []), '/employer?status=draft')

    expect(await screen.findByText('No drafts vacancies')).toBeInTheDocument()
  })

  it('pages through a long list', async () => {
    const { api, router } = renderDashboard({
      ...vacancyRoutes('approved'),
      [MINE]: (request: { path: string }) => {
        const page = Number(new URLSearchParams(request.path.split('?')[1]).get('page'))
        return listOf([makeManaged({ id: `p${page}`, title: `Page ${page} job` })], 45, page)
      },
    })
    await screen.findByText('Page 1 job')

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    expect(await screen.findByText('Page 2 job')).toBeInTheDocument()
    expect(listCalls(api).at(-1)!.get('page')).toBe('2')
    expect(router.state.location.search).toBe('?page=2')
  })
})

describe('publishing from the list', () => {
  it('publishes a draft when the company is approved', async () => {
    const { api } = renderDashboard({
      ...vacancyRoutes('approved', [draft]),
      'POST /api/v1/employer/vacancies/draft/publish': () =>
        okData({ ...draft, status: 'published', is_live: true }),
    })
    await screen.findByText('Draft job')

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))

    expect(await screen.findByText('Vacancy published.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/employer/vacancies/draft/publish')).toHaveLength(1)
  })

  it('shows Publish disabled, with the reason, until the company is approved', async () => {
    const { api } = renderDashboard(vacancyRoutes('pending', [draft]))
    await screen.findByText('Draft job')
    const publish = screen.getByRole('button', { name: 'Publish' })

    await waitFor(() =>
      expect(publish).toHaveAccessibleDescription(/finished checking your company/),
    )
    await userEvent.click(publish)

    expect(publish).toHaveAttribute('aria-disabled', 'true')
    expect(api.callsTo('POST', '/api/v1/employer/vacancies/draft/publish')).toHaveLength(0)
  })

  it('shows only drafts a Publish button', async () => {
    renderDashboard(vacancyRoutes('approved', [live, draft]))
    await screen.findByText('Live job')
    const [liveRow, draftRow] = screen.getAllByRole('listitem')

    expect(within(liveRow).queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    expect(within(draftRow).getByRole('button', { name: 'Publish' })).toBeInTheDocument()
  })

  it('says what is missing, with a link to fix it, when the server refuses an unfinished draft', async () => {
    renderDashboard({
      ...vacancyRoutes('approved', [draft]),
      'POST /api/v1/employer/vacancies/draft/publish': () =>
        apiError(422, 'vacancy_incomplete', 'Complete the vacancy before publishing it.', {
          fields: { expires_at: 'Choose when applications close.' },
        }),
    })
    await screen.findByText('Draft job')

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Complete the vacancy before publishing it.')
    expect(within(alert).getByRole('link', { name: 'Open it to fix' })).toHaveAttribute(
      'href',
      '/employer/vacancies/draft',
    )
  })
})

describe('closing and discarding', () => {
  it('asks first, and does nothing if the employer keeps the vacancy', async () => {
    const { api } = renderDashboard(vacancyRoutes('approved', [live]))
    await screen.findByText('Live job')

    await userEvent.click(screen.getByRole('button', { name: 'Close Live job' }))
    const dialog = await screen.findByRole('dialog', { name: 'Close “Live job”?' })
    expect(dialog).toHaveTextContent('cannot be reopened')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }))

    expect(api.callsTo('POST', '/api/v1/employer/vacancies/live/close')).toHaveLength(0)
  })

  it('closes after confirming', async () => {
    const { api } = renderDashboard({
      ...vacancyRoutes('approved', [live]),
      'POST /api/v1/employer/vacancies/live/close': () =>
        okData({ ...live, status: 'closed', is_live: false }),
    })
    await screen.findByText('Live job')

    await userEvent.click(screen.getByRole('button', { name: 'Close Live job' }))
    const dialog = await screen.findByRole('dialog', { name: 'Close “Live job”?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close vacancy' }))

    expect(await screen.findByText('Vacancy closed.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/employer/vacancies/live/close')).toHaveLength(1)
  })

  it('discards a draft with its own wording', async () => {
    renderDashboard({
      ...vacancyRoutes('approved', [draft]),
      'POST /api/v1/employer/vacancies/draft/close': () => okData({ ...draft, status: 'closed' }),
    })
    await screen.findByText('Draft job')

    await userEvent.click(screen.getByRole('button', { name: 'Discard Draft job' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard this draft?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard draft' }))

    expect(await screen.findByText('Draft discarded.')).toBeInTheDocument()
  })

  it('shows an error and keeps the vacancy if closing fails', async () => {
    renderDashboard({
      ...vacancyRoutes('approved', [live]),
      'POST /api/v1/employer/vacancies/live/close': () =>
        apiError(409, 'vacancy_closed', 'This vacancy is closed and cannot be changed.'),
    })
    await screen.findByText('Live job')
    await userEvent.click(screen.getByRole('button', { name: 'Close Live job' }))
    const dialog = await screen.findByRole('dialog')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close vacancy' }))

    expect(
      await screen.findByText('This vacancy is closed and cannot be changed.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Live job')).toBeInTheDocument()
  })
})

describe('other roles', () => {
  it('is only for employers (the route guard handles others), but always loads its own data', async () => {
    renderDashboard({
      ...employerRoutes(null),
      ...loggedIn(makeUser({ role: 'employer' })),
      [MINE]: () => listOf([] as ManagedVacancy[]),
    })

    expect(await screen.findByText('Set up your company profile first')).toBeInTheDocument()
  })
})
