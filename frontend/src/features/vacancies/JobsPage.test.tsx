import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { VacancyCard } from '../../api/types'
import { apiError, mockApi, renderRoutes } from '../../test/utils'
import { JobsPage } from './JobsPage'
import {
  DEGREE,
  GULU,
  KAMPALA,
  LIST,
  listResponse,
  makeCard,
  pageOf,
  publicRoutes,
  queryOf,
} from './testData'

type Routes = Parameters<typeof mockApi>[0]

function renderJobs(
  route = '/jobs',
  handler: (query: URLSearchParams) => Response = () => listResponse(pageOf([makeCard()])),
) {
  const api = mockApi({
    ...publicRoutes(),
    [LIST]: (request) => handler(queryOf(request)),
  } as Routes)
  const view = renderRoutes(
    [
      { path: '/jobs', element: <JobsPage /> },
      { path: '/jobs/:id', element: <p>Detail page</p> },
    ],
    { route },
  )
  return { api, ...view }
}

const listCalls = (api: ReturnType<typeof renderJobs>['api']) =>
  api.calls
    .filter((call) => call.path.startsWith('/api/v1/vacancies?'))
    .map((call) => queryOf(call))
const lastQuery = (api: ReturnType<typeof renderJobs>['api']) => listCalls(api).at(-1)!
const chip = (name: RegExp) => userEvent.click(screen.getByRole('button', { name }))
const pickDistrict = async (name: string) => {
  await screen.findByRole('option', { name })
  await userEvent.selectOptions(screen.getByLabelText('Where'), name)
}

function cards(count: number): VacancyCard[] {
  return Array.from({ length: count }, (_, index) =>
    makeCard({ id: `v${index}`, title: `Job ${index}` }),
  )
}

describe('showing jobs', () => {
  it('shows skeletons, then the cards, and asks for the first page of twenty', async () => {
    const { api } = renderJobs()

    expect(screen.getByText('Loading jobs')).toBeInTheDocument()
    expect(await screen.findByText('Accounts Assistant')).toBeInTheDocument()
    expect(screen.queryByText('Loading jobs')).not.toBeInTheDocument()
    expect(lastQuery(api).get('page')).toBe('1')
    expect(lastQuery(api).get('page_size')).toBe('20')
    expect(lastQuery(api).has('q')).toBe(false)
  })

  it('shows what a card needs and links to the details', async () => {
    renderJobs('/jobs', () =>
      listResponse(
        pageOf([
          makeCard({
            salary_min: 1_200_000,
            salary_max: 1_500_000,
            expires_at: '2026-11-08T09:00:00Z',
            published_at: new Date().toISOString(),
          }),
        ]),
      ),
    )

    const link = await screen.findByRole('link', { name: /Accounts Assistant/ })

    expect(link).toHaveAttribute('href', '/jobs/v1')
    expect(link).toHaveTextContent('Ssese Foods Ltd')
    expect(link).toHaveTextContent('Kampala')
    expect(link).toHaveTextContent('Full-time')
    expect(link).toHaveTextContent('UGX 1,200,000 – 1,500,000')
    expect(link).toHaveTextContent('Posted today')
  })

  it('announces the number of jobs in a polite live region', async () => {
    renderJobs('/jobs', () => listResponse(pageOf(cards(3), 24)))

    const summary = await screen.findByText('24 jobs')

    expect(summary).toHaveAttribute('aria-live', 'polite')
  })

  it('says "1 job" for one', async () => {
    renderJobs()

    expect(await screen.findByText('1 job')).toBeInTheDocument()
  })

  it('shows an error with Retry, and recovers', async () => {
    let fail = true
    renderJobs('/jobs', () =>
      fail ? apiError(500, 'internal_error', 'Server error') : listResponse(pageOf([makeCard()])),
    )

    expect(await screen.findByText('Could not load jobs')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Accounts Assistant')).toBeInTheDocument()
  })

  it('shows an empty state with "Clear filters" when nothing matches', async () => {
    const { router } = renderJobs('/jobs?employment_type=internship', (query) =>
      listResponse(query.has('employment_type') ? pageOf([]) : pageOf([makeCard()])),
    )

    expect(await screen.findByText('No jobs match your search')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(await screen.findByText('Accounts Assistant')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('has no "Clear filters" button when there were no filters, only a gentle message', async () => {
    renderJobs('/jobs', () => listResponse(pageOf([])))

    expect(await screen.findByText('No jobs match your search')).toBeInTheDocument()
    expect(screen.getByText(/no vacancies right now/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })
})

describe('the address is the state', () => {
  it('reads the filters and the page from the address, into the request and the controls', async () => {
    const { api } = renderJobs(
      `/jobs?q=accounts&district_id=${GULU}&employment_type=internship&work_arrangement=remote&qualification_level_id=${DEGREE}&page=2`,
      () => listResponse(pageOf(cards(2), 45, 2)),
    )
    await screen.findByText('Job 0')

    const query = lastQuery(api)
    expect(Object.fromEntries(query)).toEqual({
      q: 'accounts',
      district_id: GULU,
      employment_type: 'internship',
      work_arrangement: 'remote',
      qualification_level_id: DEGREE,
      page: '2',
      page_size: '20',
    })
    expect(screen.getByLabelText('Search jobs')).toHaveValue('accounts')
    await waitFor(() => expect(screen.getByLabelText('Where')).toHaveValue(GULU))
    // Each chip shows its choice, and the list inside has it ticked.
    await chip(/^Job type: Internship/)
    expect(screen.getByRole('radio', { name: 'Internship' })).toBeChecked()
    await chip(/^Where you work: Remote/)
    expect(screen.getByRole('radio', { name: 'Remote' })).toBeChecked()
    await chip(/^Qualification: Bachelor's degree/)
    expect(screen.getByRole('radio', { name: "Bachelor's degree" })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
  })

  it('ignores invalid values in the address', async () => {
    const { api } = renderJobs('/jobs?employment_type=gig&district_id=nope&page=-4&sort=cheapest')
    await screen.findByText('Accounts Assistant')

    expect(Object.fromEntries(lastQuery(api))).toEqual({ page: '1', page_size: '20' })
  })

  it('a filter choice changes the address and the request, and goes back to page 1', async () => {
    const { api, router } = renderJobs('/jobs?page=3', () => listResponse(pageOf(cards(2), 70, 3)))
    await screen.findByText('Job 0')

    await chip(/^Job type/)
    await userEvent.click(screen.getByRole('radio', { name: 'Part-time' }))

    await waitFor(() => expect(lastQuery(api).get('employment_type')).toBe('part_time'))
    expect(lastQuery(api).get('page')).toBe('1')
    expect(router.state.location.search).toBe('?employment_type=part_time')
  })

  it('each filter can be set, combined and cleared with "Clear"', async () => {
    const { api, router } = renderJobs()
    await screen.findByText('Accounts Assistant')

    await pickDistrict('Gulu')
    await chip(/^Job type/)
    await userEvent.click(screen.getByRole('radio', { name: 'Contract' }))
    await chip(/^Where you work/)
    await userEvent.click(screen.getByRole('radio', { name: 'Hybrid' }))
    await chip(/^Qualification/)
    await userEvent.click(screen.getByRole('radio', { name: 'Diploma' }))

    await waitFor(() =>
      expect(Object.fromEntries(lastQuery(api))).toMatchObject({
        district_id: GULU,
        employment_type: 'contract',
        work_arrangement: 'hybrid',
        qualification_level_id: expect.any(String),
      }),
    )

    await chip(/^Job type: Contract/)
    await userEvent.click(screen.getByRole('button', { name: 'Clear job type' }))
    await userEvent.selectOptions(screen.getByLabelText('Where'), 'All districts')

    await waitFor(() => expect(lastQuery(api).has('district_id')).toBe(false))
    expect(lastQuery(api).has('employment_type')).toBe(false)
    expect(router.state.location.search).toContain('work_arrangement=hybrid')
  })

  it('the back button undoes a filter', async () => {
    const { router, api } = renderJobs()
    await screen.findByText('Accounts Assistant')
    await chip(/^Job type/)
    await userEvent.click(screen.getByRole('radio', { name: 'Internship' }))
    await waitFor(() => expect(router.state.location.search).toBe('?employment_type=internship'))

    await router.navigate(-1)

    await waitFor(() => expect(router.state.location.search).toBe(''))
    await waitFor(() => expect(lastQuery(api).has('employment_type')).toBe(false))
    // The chip is back to its plain name and nothing is ticked.
    await chip(/^Job type$/)
    expect(screen.getByRole('radio', { name: 'Internship' })).not.toBeChecked()
  })
})

describe('searching', () => {
  it('searches for the typed words, trimmed, and starts again from page 1', async () => {
    const { api, router } = renderJobs('/jobs?page=2', () => listResponse(pageOf(cards(1), 45, 2)))
    await screen.findByText('Job 0')

    await userEvent.type(screen.getByLabelText('Search jobs'), '  tailor  ')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(lastQuery(api).get('q')).toBe('tailor'))
    expect(lastQuery(api).get('page')).toBe('1')
    expect(router.state.location.search).toBe('?q=tailor')
  })

  it('searching with the Enter key works too', async () => {
    const { api } = renderJobs()
    await screen.findByText('Accounts Assistant')

    await userEvent.type(screen.getByLabelText('Search jobs'), 'driver{Enter}')

    await waitFor(() => expect(lastQuery(api).get('q')).toBe('driver'))
  })

  it('an empty search clears the words', async () => {
    const { api } = renderJobs('/jobs?q=tailor')
    await screen.findByText('Accounts Assistant')

    await userEvent.clear(screen.getByLabelText('Search jobs'))
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(lastQuery(api).has('q')).toBe(false))
  })

  it('keeps the other filters when searching', async () => {
    const { api } = renderJobs('/jobs?employment_type=contract')
    await screen.findByText('Accounts Assistant')

    await userEvent.type(screen.getByLabelText('Search jobs'), 'cook{Enter}')

    await waitFor(() => expect(lastQuery(api).get('q')).toBe('cook'))
    expect(lastQuery(api).get('employment_type')).toBe('contract')
  })

  it('shows the sort only while searching, and sends it', async () => {
    const { api, router } = renderJobs()
    await screen.findByText('Accounts Assistant')
    expect(screen.queryByLabelText('Sort')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Search jobs'), 'cook{Enter}')
    const sort = await screen.findByLabelText('Sort')
    expect(sort).toHaveValue('relevance')
    await userEvent.selectOptions(sort, 'Newest')

    await waitFor(() => expect(lastQuery(api).get('sort')).toBe('newest'))
    expect(router.state.location.search).toContain('sort=newest')
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'Best match')
    await waitFor(() => expect(lastQuery(api).has('sort')).toBe(false))
  })

  it('puts the search words in the result summary', async () => {
    renderJobs('/jobs?q=accounts&district_id=' + KAMPALA, () => listResponse(pageOf(cards(1), 24)))

    expect(await screen.findByText('24 jobs for “accounts” in Kampala')).toBeInTheDocument()
  })
})

describe('active filters', () => {
  it('shows each as a removable pill and removes one at a time', async () => {
    const { api, router } = renderJobs(
      `/jobs?q=accounts&district_id=${KAMPALA}&employment_type=full_time`,
    )
    await screen.findByText('Accounts Assistant')
    const group = screen.getByRole('group', { name: 'Active filters' })
    expect(within(group).getByRole('button', { name: 'Remove filter: “accounts”' })).toBeVisible()
    expect(within(group).getByRole('button', { name: 'Remove filter: Kampala' })).toBeVisible()

    await userEvent.click(within(group).getByRole('button', { name: 'Remove filter: Kampala' }))

    await waitFor(() => expect(lastQuery(api).has('district_id')).toBe(false))
    expect(router.state.location.search).toBe('?q=accounts&employment_type=full_time')
    expect(screen.queryByRole('button', { name: 'Remove filter: Kampala' })).not.toBeInTheDocument()
  })

  it('"Clear all" removes everything', async () => {
    const { router } = renderJobs(`/jobs?q=accounts&employment_type=full_time&page=2`, () =>
      listResponse(pageOf(cards(1), 45, 2)),
    )
    await screen.findByText('Job 0')
    const group = screen.getByRole('group', { name: 'Active filters' })

    await userEvent.click(within(group).getByRole('button', { name: 'Clear all' }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.getByLabelText('Search jobs')).toHaveValue('')
  })

  it('shows no pills when nothing is filtered', async () => {
    renderJobs()
    await screen.findByText('Accounts Assistant')

    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument()
  })
})

describe('pages', () => {
  it('shows page buttons for the total, and goes to another page through the address', async () => {
    const { api, router } = renderJobs('/jobs', (query) =>
      query.get('page') === '2'
        ? listResponse(pageOf([makeCard({ id: 'b', title: 'Page two job' })], 45, 2))
        : listResponse(pageOf(cards(1), 45, 1)),
    )
    await screen.findByText('Job 0')
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Page 4' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    expect(await screen.findByText('Page two job')).toBeInTheDocument()
    expect(lastQuery(api).get('page')).toBe('2')
    expect(router.state.location.search).toBe('?page=2')
  })

  it('Previous and Next move one page, and the back button returns', async () => {
    const { router } = renderJobs('/jobs?page=2', (query) =>
      listResponse(pageOf(cards(1), 60, Number(query.get('page')))),
    )
    await screen.findByText('Job 0')

    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(router.state.location.search).toBe('?page=3'))
    await userEvent.click(screen.getByRole('button', { name: /previous/i }))
    await waitFor(() => expect(router.state.location.search).toBe('?page=2'))
    await router.navigate(-1)

    await waitFor(() => expect(router.state.location.search).toBe('?page=3'))
  })

  it('shows no page buttons when everything fits on one page', async () => {
    renderJobs('/jobs', () => listResponse(pageOf(cards(5), 20)))
    await screen.findByText('Job 0')

    expect(screen.queryByRole('navigation', { name: 'Job pages' })).not.toBeInTheDocument()
  })

  it('exactly twenty-one jobs make two pages', async () => {
    renderJobs('/jobs', () => listResponse(pageOf(cards(1), 21)))
    await screen.findByText('Job 0')

    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Page 3' })).not.toBeInTheDocument()
  })
})

describe('the phone filter sheet', () => {
  const filtersButton = () => screen.getByRole('button', { name: /^Filters/ })

  it('opens with the current filters, and shows how many are set', async () => {
    renderJobs(`/jobs?district_id=${GULU}&employment_type=contract`)
    await screen.findByText('Accounts Assistant')

    expect(filtersButton()).toHaveAccessibleName('Filters (2)')
    await userEvent.click(filtersButton())
    const sheet = await screen.findByRole('dialog', { name: 'Filters' })

    expect(within(sheet).getByLabelText('District')).toHaveValue(GULU)
    expect(within(sheet).getByRole('radio', { name: 'Contract' })).toBeChecked()
  })

  it('changes only apply when "Show N jobs" is pressed, and the count comes from the server', async () => {
    const { api, router } = renderJobs('/jobs', (query) =>
      listResponse(
        query.get('page_size') === '1'
          ? pageOf([makeCard()], query.get('employment_type') === 'internship' ? 7 : 24)
          : pageOf([makeCard()], 24),
      ),
    )
    await screen.findByText('Accounts Assistant')
    await userEvent.click(filtersButton())
    const sheet = await screen.findByRole('dialog', { name: 'Filters' })

    await userEvent.click(within(sheet).getByRole('radio', { name: 'Internship' }))

    expect(await within(sheet).findByRole('button', { name: 'Show 7 jobs' })).toBeVisible()
    expect(router.state.location.search).toBe('') // nothing applied yet
    expect(lastQuery(api).has('employment_type') && lastQuery(api).get('page_size') !== '1').toBe(
      false,
    )

    await userEvent.click(within(sheet).getByRole('button', { name: 'Show 7 jobs' }))

    await waitFor(() => expect(router.state.location.search).toBe('?employment_type=internship'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closing the sheet without applying changes nothing', async () => {
    const { router } = renderJobs()
    await screen.findByText('Accounts Assistant')
    await userEvent.click(filtersButton())
    const sheet = await screen.findByRole('dialog', { name: 'Filters' })
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Part-time' }))

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.search).toBe('')
  })

  it('"Clear" in the sheet empties the choices but keeps the search words', async () => {
    renderJobs(`/jobs?q=cook&employment_type=contract`)
    await screen.findByText('Accounts Assistant')
    await userEvent.click(filtersButton())
    const sheet = await screen.findByRole('dialog', { name: 'Filters' })

    await userEvent.click(within(sheet).getByRole('button', { name: 'Clear' }))
    await userEvent.click(within(sheet).getByRole('button', { name: /^Show/ }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Search jobs')).toHaveValue('cook')
    expect(screen.queryByRole('radio', { name: 'Contract', checked: true })).not.toBeInTheDocument()
  })
})

describe('no adverts while searching', () => {
  it('does not show the support or sponsor section on the job list', async () => {
    renderJobs()
    await screen.findByText('Accounts Assistant')

    expect(screen.queryByText('Sponsored')).not.toBeInTheDocument()
    expect(screen.queryByText(/Help keep DJMS free/)).not.toBeInTheDocument()
  })
})
