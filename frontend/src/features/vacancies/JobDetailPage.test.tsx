import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { UserRole, VacancyDetail } from '../../api/types'
import {
  apiError,
  loggedIn,
  jsonResponse,
  loggedOut,
  makeUser,
  mockApi,
  okData,
  renderRoutes,
} from '../../test/utils'
import { JobDetailPage } from './JobDetailPage'
import { makeDetail, notFound } from './testData'

type Routes = Parameters<typeof mockApi>[0]
const DETAIL = 'GET /api/v1/vacancies/v1'

function renderDetail(
  detail: VacancyDetail | (() => Response) = makeDetail(),
  options: {
    user?: ReturnType<typeof makeUser> | null
    state?: { from: string }
    application?: { id: string; status: string }
  } = {},
) {
  const mine = options.application ? [{ ...options.application, vacancy: { id: 'v1' } }] : []
  const api = mockApi({
    'GET /api/v1/applications/me*': () =>
      jsonResponse({ data: mine, meta: { page: 1, page_size: 1, total: mine.length } }),
    ...(options.user ? loggedIn(options.user) : loggedOut),
    [DETAIL]: typeof detail === 'function' ? detail : () => okData(detail),
  } as Routes)
  const view = renderRoutes(
    [
      { path: '/jobs', element: <p>Job list</p> },
      { path: '/jobs/:id', element: <JobDetailPage /> },
      { path: '/login', element: <p>Login page</p> },
    ],
    { route: '/jobs/v1' },
  )
  return { api, ...view }
}

const seeker = (verified = true) => makeUser({ role: 'job_seeker', email_verified: verified })
const as = (role: UserRole) => makeUser({ role })

describe('loading and errors', () => {
  it('shows a status while loading, then the vacancy', async () => {
    renderDetail()

    expect(screen.getByText('Loading the vacancy')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Accounts Assistant', level: 1 }),
    ).toBeVisible()
  })

  it('says so, with a way on, when the vacancy has closed or expired (404)', async () => {
    renderDetail(notFound)

    expect(
      await screen.findByRole('heading', { name: 'This vacancy is no longer available' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Find other jobs' })).toHaveAttribute('href', '/jobs')
  })

  it('shows an error with Retry for any other failure', async () => {
    let fail = true
    renderDetail(() =>
      fail ? apiError(500, 'internal_error', 'Server error') : okData(makeDetail()),
    )

    expect(await screen.findByText('Could not load this vacancy')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('heading', { name: 'Accounts Assistant', level: 1 }),
    ).toBeVisible()
  })
})

describe('the vacancy', () => {
  it('shows the title block, the key facts and the description', async () => {
    renderDetail(makeDetail({ expires_at: '2099-01-10T09:00:00Z' }))
    await screen.findByRole('heading', { name: 'Accounts Assistant', level: 1 })

    expect(screen.getByText('Ssese Foods Ltd')).toBeVisible()
    expect(screen.getAllByText('Kampala').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Full-time').length).toBeGreaterThan(0)
    const facts = screen.getByLabelText('Key facts')
    expect(within(facts).getByText('UGX 1,200,000 – 1,500,000')).toBeVisible()
    expect(within(facts).getByText("Bachelor's degree")).toBeVisible()
    expect(within(facts).getByText('2 years')).toBeVisible()
    expect(within(facts).getByText('On-site')).toBeVisible()
    expect(within(facts).getByText(/10 Jan 2099 \(\d+ days left\)/)).toBeVisible()
    expect(screen.getByRole('heading', { name: 'About the role' })).toBeVisible()
    expect(screen.getByText(/Prepare invoices\.\s*Reconcile accounts\./)).toBeVisible()
  })

  it('leaves out the salary when there is none, and says "No minimum" without a level', async () => {
    renderDetail(
      makeDetail({
        salary_min: null,
        salary_max: null,
        min_qualification_level_id: null,
        min_qualification_level_name: null,
        min_experience_years: 0,
      }),
    )
    await screen.findByRole('heading', { name: 'Accounts Assistant', level: 1 })
    const facts = screen.getByLabelText('Key facts')

    expect(within(facts).queryByText('Salary')).not.toBeInTheDocument()
    expect(within(facts).getByText('No minimum')).toBeVisible()
    expect(within(facts).getByText('None required')).toBeVisible()
  })

  it('shows a warning in the last week', async () => {
    renderDetail(makeDetail({ expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString() }))

    expect(await screen.findByText(/^Closes in [12] days?$|^Closes tomorrow$/)).toBeVisible()
  })

  it('groups requirements as Required and Preferred', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Requirements' })

    const required = screen.getByRole('heading', { name: 'Required' }).parentElement as HTMLElement
    const preferred = screen.getByRole('heading', { name: 'Preferred' })
      .parentElement as HTMLElement
    expect(
      within(required)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Microsoft Excel', 'Degree in accounting'])
    expect(
      within(preferred)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['CPA Part 1'])
  })

  it('shows only the groups that exist, and no section without requirements', async () => {
    const view = renderDetail(
      makeDetail({
        requirements: [
          { id: 'r1', kind: 'other', skill_id: null, label: 'Own motorbike', is_mandatory: false },
        ],
      }),
    )
    await screen.findByRole('heading', { name: 'Requirements' })
    expect(screen.queryByRole('heading', { name: 'Required' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Preferred' })).toBeVisible()
    view.unmount()

    renderDetail(makeDetail({ requirements: [] }))
    await screen.findByRole('heading', { name: 'Accounts Assistant', level: 1 })
    expect(screen.queryByRole('heading', { name: 'Requirements' })).not.toBeInTheDocument()
  })

  it('names a remote job as remote', async () => {
    renderDetail(makeDetail({ work_arrangement: 'remote', district_id: null, district_name: null }))

    await screen.findByRole('heading', { name: 'Accounts Assistant', level: 1 })

    expect(screen.getAllByText('Remote').length).toBeGreaterThan(0)
  })

  it('"Back to results" returns to the list the person came from', async () => {
    mockApi({ ...loggedOut, [DETAIL]: () => okData(makeDetail()) } as Routes)
    renderRoutes(
      [
        { path: '/jobs', element: <p>Job list</p> },
        { path: '/jobs/:id', element: <JobDetailPage /> },
      ],
      { route: { pathname: '/jobs/v1', state: { from: '?q=cook&page=2' } } as unknown as string },
    )

    const back = await screen.findByRole('link', { name: '‹ Back to results' })

    expect(back).toHaveAttribute('href', '/jobs?q=cook&page=2')
  })

  it('"Back to results" is just the list if there is nothing to return to', async () => {
    renderDetail()

    expect(await screen.findByRole('link', { name: '‹ Back to results' })).toHaveAttribute(
      'href',
      '/jobs',
    )
  })
})

describe('applying inside the site', () => {
  it('an anonymous visitor is sent to log in, and brought back here afterwards', async () => {
    renderDetail()

    const link = await screen.findByRole('link', { name: 'Log in to apply' })

    expect(link).toHaveAttribute('href', '/login?next=%2Fjobs%2Fv1')
    expect(screen.queryByText(/another website/)).not.toBeInTheDocument()
  })

  it('a verified job seeker gets an Apply link to the apply page', async () => {
    renderDetail(makeDetail(), { user: seeker() })

    const apply = await screen.findByRole('link', { name: 'Apply' })

    expect(apply).toHaveAttribute('href', '/jobs/v1/apply')
  })

  it('a job seeker who has applied sees Applied, the status, and a way to the application', async () => {
    renderDetail(makeDetail(), {
      user: seeker(),
      application: { id: 'a1', status: 'shortlisted' },
    })

    const link = await screen.findByRole('link', { name: 'See your application' })

    expect(link).toHaveAttribute('href', '/applications/a1')
    expect(screen.getByText('Applied')).toBeVisible()
    expect(screen.getByText('Shortlisted')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Apply' })).not.toBeInTheDocument()
  })

  it('an unverified job seeker is told to verify the email first', async () => {
    renderDetail(makeDetail(), { user: seeker(false) })

    const apply = await screen.findByRole('button', { name: 'Apply' })

    expect(apply).toHaveAccessibleDescription(/Verify your email address/)
    expect(apply).toHaveAttribute('title', 'Verify your email to apply')
  })

  it('clicking the disabled Apply does nothing', async () => {
    renderDetail(makeDetail(), { user: seeker(false) })
    const apply = await screen.findByRole('button', { name: 'Apply' })

    await userEvent.click(apply)

    expect(screen.getByRole('heading', { name: 'Accounts Assistant', level: 1 })).toBeVisible()
  })

  it.each(['employer', 'admin'] as const)('a %s gets no Apply bar', async (role) => {
    renderDetail(makeDetail(), { user: as(role) })
    await screen.findByRole('heading', { name: 'Accounts Assistant', level: 1 })

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Log in to apply' })).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
  })
})

describe('applying on another website', () => {
  const external = makeDetail({
    application_method: 'external',
    external_url: 'https://jobs.kigezihealth.example/apply?id=12',
  })

  it('explains it, and opens the employer site in a new tab, safely', async () => {
    renderDetail(external)

    const notice = await screen.findByText(/You will apply on another website\./)
    const link = screen.getByRole('link', { name: 'Continue to employer site' })

    expect(notice.parentElement).toHaveTextContent(
      'You will apply on another website. Applications there are not tracked here',
    )
    expect(link).toHaveAttribute('href', 'https://jobs.kigezihealth.example/apply?id=12')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('Opens jobs.kigezihealth.example in a new tab.')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Log in to apply' })).not.toBeInTheDocument()
  })

  it('looks the same for a logged-in job seeker, and there is no Apply button', async () => {
    renderDetail(external, { user: seeker() })

    expect(await screen.findByRole('link', { name: 'Continue to employer site' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
  })
})
