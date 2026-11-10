import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ApplicantItem, ApplicationDetail } from '../../api/types'
import {
  apiError,
  jsonResponse,
  loggedIn,
  makeUser,
  mockApi,
  okData,
  renderRoutes,
} from '../../test/utils'
import { ApplicantDetailPage } from './ApplicantDetailPage'
import { ApplicantsPage } from './ApplicantsPage'
import { makeApplication, makeHistory } from './testData'

type Routes = Parameters<typeof mockApi>[0]
const employer = loggedIn(makeUser({ role: 'employer' }))

function makeApplicant(overrides: Partial<ApplicantItem> = {}): ApplicantItem {
  return {
    id: 'a1',
    status: 'submitted',
    submitted_at: '2026-11-06T08:02:00Z',
    updated_at: '2026-11-06T08:02:00Z',
    applicant_name: 'Nakato Sarah',
    applicant_email: 'nakato@example.com',
    qualification: "Bachelor's degree",
    institution: 'Gulu University',
    has_cover_note: true,
    ...overrides,
  }
}

const LIST = 'GET /api/v1/employer/vacancies/v1/applications*'

function renderList(
  applicants: ApplicantItem[] | (() => Response),
  { total, route = '/employer/vacancies/v1/applicants' } = {
    total: undefined as number | undefined,
    route: undefined as string | undefined,
  },
) {
  const api = mockApi({
    ...employer,
    'GET /api/v1/applications/a1': () => jsonResponse({ data: makeApplication({ id: 'a1' }) }),
    [LIST]:
      typeof applicants === 'function'
        ? applicants
        : () =>
            jsonResponse({
              data: applicants,
              meta: { page: 1, page_size: 20, total: total ?? applicants.length },
            }),
  } as Routes)
  const view = renderRoutes(
    [
      { path: '/employer/vacancies/:id/applicants', element: <ApplicantsPage /> },
      { path: '/employer/applications/:id', element: <p>Applicant page</p> },
      { path: '/employer', element: <p>Dashboard</p> },
    ],
    { route: route ?? '/employer/vacancies/v1/applicants' },
  )
  return { api, ...view }
}

describe('the applicants list', () => {
  it('opens a pop-up preview of an applicant without leaving the list', async () => {
    const { api } = renderList([makeApplicant()], { total: undefined, route: undefined })
    await screen.findByRole('link', { name: /Nakato Sarah/ })
    expect(api.calls.some((call) => call.path === '/api/v1/applications/a1')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Quick view of Nakato Sarah' }))

    const dialog = await screen.findByRole('dialog', { name: 'Nakato Sarah' })
    expect(within(dialog).getByText('Excel')).toBeInTheDocument()
    expect(within(dialog).getByText('Recent accounting graduate.')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Open full application' })).toHaveAttribute(
      'href',
      '/employer/applications/a1',
    )

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows each applicant with status, qualification and the date', async () => {
    renderList([
      makeApplicant(),
      makeApplicant({
        id: 'a2',
        applicant_name: 'Okello Daniel',
        status: 'shortlisted',
        has_cover_note: false,
      }),
    ])

    const first = await screen.findByRole('link', { name: /Nakato Sarah/ })

    expect(first).toHaveAttribute('href', '/employer/applications/a1')
    expect(first).toHaveTextContent("Bachelor's degree · Gulu University")
    expect(first).toHaveTextContent('Applied 6 Nov 2026 · Cover note')
    expect(within(first).getByText('Submitted')).toBeVisible()
    const second = screen.getByRole('link', { name: /Okello Daniel/ })
    expect(second).not.toHaveTextContent('Cover note')
    expect(screen.getByText('2 applicants')).toBeVisible()
  })

  it('shows a status while loading', () => {
    renderList(() => new Response(null))

    expect(screen.getByText('Loading applicants')).toBeInTheDocument()
  })

  it('shows an empty state when no one has applied', async () => {
    renderList([])

    expect(await screen.findByText('No one has applied yet')).toBeVisible()
  })

  it('filters by status, and says so when there are none', async () => {
    const { api } = renderList(() =>
      jsonResponse({ data: [], meta: { page: 1, page_size: 20, total: 0 } }),
    )
    await screen.findByText('No one has applied yet')

    await userEvent.click(screen.getByRole('button', { name: 'Shortlisted' }))

    expect(await screen.findByText('No applicants with this status')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Shortlisted' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(api.calls.some((call) => call.path.includes('status=shortlisted'))).toBe(true)
  })

  it('starts from the status in the address', async () => {
    const { api } = renderList([makeApplicant({ status: 'interview' })], {
      total: undefined,
      route: '/employer/vacancies/v1/applicants?status=interview',
    })

    await screen.findByRole('link', { name: /Nakato Sarah/ })

    expect(screen.getByRole('button', { name: 'Interview' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(api.calls.some((call) => call.path.includes('status=interview'))).toBe(true)
  })

  it('pages through long lists', async () => {
    const { api } = renderList([makeApplicant()], { total: 45, route: undefined })

    await userEvent.click(await screen.findByRole('button', { name: /Page 2|2/ }))

    await waitFor(() => expect(api.calls.some((call) => call.path.includes('page=2'))).toBe(true))
  })

  it('shows Retry after an error, and recovers', async () => {
    let fail = true
    renderList(() =>
      fail
        ? apiError(500, 'server_error', 'Oops')
        : jsonResponse({ data: [makeApplicant()], meta: { page: 1, page_size: 20, total: 1 } }),
    )

    expect(await screen.findByText('Could not load the applicants')).toBeVisible()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('link', { name: /Nakato Sarah/ })).toBeVisible()
  })

  it('says so when the vacancy belongs to someone else (404)', async () => {
    renderList(() => apiError(404, 'vacancy_not_found', 'This vacancy does not exist.'))

    expect(await screen.findByText('We could not find this vacancy')).toBeVisible()
  })
})

const DETAIL = 'GET /api/v1/applications/a1'
const STATUS = 'POST /api/v1/employer/applications/a1/status'

function forEmployer(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return makeApplication({
    applicant_email: 'nakato@example.com',
    next_statuses: ['under_review', 'rejected'],
    ...overrides,
  })
}

function renderDetail(
  application: ApplicationDetail | (() => Response) = forEmployer(),
  routes: Record<string, unknown> = {},
) {
  const api = mockApi({
    ...employer,
    [DETAIL]: typeof application === 'function' ? application : () => okData(application),
    ...routes,
  } as Routes)
  const view = renderRoutes(
    [
      { path: '/employer/applications/:id', element: <ApplicantDetailPage /> },
      { path: '/employer/vacancies/:id/applicants', element: <p>Applicants page</p> },
      { path: '/employer', element: <p>Dashboard</p> },
    ],
    { route: '/employer/applications/a1' },
  )
  return { api, ...view }
}

describe('one applicant', () => {
  it('shows the contact details, the profile snapshot and the cover note', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Nakato Sarah', level: 1 })).toBeVisible()
    expect(screen.getByText('nakato@example.com')).toBeVisible()
    expect(screen.getByText('+256772123456')).toBeVisible()
    expect(screen.getByText('Gulu University')).toBeVisible()
    expect(screen.getByText("Bachelor's degree")).toBeVisible()
    expect(screen.getByText('Excel')).toBeVisible()
    expect(screen.getByText(/Accounts Intern, Ssese Fresh Foods Ltd/)).toBeVisible()
    expect(screen.getByText('I finished my accounting degree in July.')).toBeVisible()
    expect(screen.getByRole('link', { name: '‹ All applicants' })).toHaveAttribute(
      'href',
      '/employer/vacancies/v1/applicants',
    )
  })

  it('the CV button points at the snapshot endpoint', async () => {
    renderDetail()

    const download = await screen.findByRole('link', { name: /Download CV/ })

    expect(download).toHaveAttribute('href', '/api/v1/employer/applications/a1/cv')
    expect(download).toHaveTextContent('nakato-cv.pdf, 240 KB')
  })

  it('offers only the statuses the rules allow from here', async () => {
    renderDetail(forEmployer({ status: 'shortlisted', next_statuses: ['interview', 'rejected'] }))

    await screen.findByRole('heading', { name: 'Status' })

    expect(screen.getAllByRole('radio').map((radio) => (radio as HTMLInputElement).value)).toEqual([
      'interview',
      'rejected',
    ])
    expect(screen.queryByRole('radio', { name: 'Offered' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Submitted' })).not.toBeInTheDocument()
  })

  it.each(['rejected', 'withdrawn'] as const)(
    'offers no control for a %s application',
    async (status) => {
      renderDetail(forEmployer({ status, next_statuses: [] }))

      expect(await screen.findByText(/It cannot be changed any more/)).toBeVisible()
      expect(screen.queryByRole('radio')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Update status' })).not.toBeInTheDocument()
    },
  )

  it('needs a status chosen before it can be saved', async () => {
    const { api } = renderDetail()
    const save = await screen.findByRole('button', { name: 'Update status' })

    expect(save).toBeDisabled()
    expect(api.callsTo('POST', '/api/v1/employer/applications/a1/status')).toHaveLength(0)
  })

  it('moves the application on with a note, then shows the new status and history', async () => {
    const moved = forEmployer({
      status: 'under_review',
      next_statuses: ['shortlisted', 'rejected'],
      history: makeHistory(
        ['submitted', '2026-11-06T08:02:00Z'],
        ['under_review', '2026-11-06T09:10:00Z', 'Looks promising.'],
      ),
    })
    const { api } = renderDetail(forEmployer(), { [STATUS]: () => okData(moved) })
    await userEvent.click(await screen.findByRole('radio', { name: 'Under review' }))
    await userEvent.type(screen.getByLabelText('Note (optional)'), '  Looks promising.  ')

    await userEvent.click(screen.getByRole('button', { name: 'Update status' }))

    expect(await screen.findByText('Moved to Under review.')).toBeVisible()
    expect(api.callsTo('POST', '/api/v1/employer/applications/a1/status')[0].body).toEqual({
      status: 'under_review',
      note: 'Looks promising.',
    })
    expect(await screen.findByRole('radio', { name: 'Shortlisted' })).toBeVisible()
    const timeline = screen.getByRole('list', { name: 'Application history' })
    expect(within(timeline).getAllByRole('listitem')[0]).toHaveTextContent('Looks promising.')
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('')
  })

  it('sends no note when it is left empty', async () => {
    const { api } = renderDetail(forEmployer(), {
      [STATUS]: () => okData(forEmployer({ status: 'rejected', next_statuses: [] })),
    })
    await userEvent.click(await screen.findByRole('radio', { name: 'Not selected' }))

    await userEvent.click(screen.getByRole('button', { name: 'Update status' }))

    await screen.findByText('Moved to Not selected.')
    expect(api.callsTo('POST', '/api/v1/employer/applications/a1/status')[0].body).toEqual({
      status: 'rejected',
      note: null,
    })
  })

  it('refuses a note that is too long, without sending', async () => {
    const { api } = renderDetail()
    await userEvent.click(await screen.findByRole('radio', { name: 'Under review' }))
    await userEvent.click(screen.getByLabelText('Note (optional)'))
    await userEvent.paste('x'.repeat(1001))

    expect(await screen.findByText('Use at most 1000 characters')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Update status' })).toBeDisabled()
    expect(api.callsTo('POST', '/api/v1/employer/applications/a1/status')).toHaveLength(0)
  })

  it('shows the reason and keeps the form when the server refuses the move', async () => {
    renderDetail(forEmployer(), {
      [STATUS]: () =>
        apiError(
          409,
          'invalid_status_transition',
          'An application cannot move from rejected to under_review.',
        ),
    })
    await userEvent.click(await screen.findByRole('radio', { name: 'Under review' }))

    await userEvent.click(screen.getByRole('button', { name: 'Update status' }))

    expect(await screen.findByText(/cannot move from rejected to under_review/)).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Under review' })).toBeChecked()
  })

  it('says so when the application belongs to someone else (404)', async () => {
    renderDetail(() => apiError(404, 'application_not_found', 'No such application.'))

    expect(
      await screen.findByRole('heading', { name: 'We could not find this application' }),
    ).toBeVisible()
  })

  it('shows Retry after a server error', async () => {
    renderDetail(() => apiError(500, 'server_error', 'Oops'))

    expect(await screen.findByText('Could not load this applicant')).toBeVisible()
  })
})
