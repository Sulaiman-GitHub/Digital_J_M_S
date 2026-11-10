import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { apiError, loggedIn, makeUser, mockApi, renderRoutes } from '../../test/utils'
import {
  KAMPALA,
  LIST,
  listResponse,
  makeCard,
  pageOf,
  publicRoutes,
  queryOf,
} from '../vacancies/testData'
import { HomePage } from './HomePage'

type Routes = Parameters<typeof mockApi>[0]

function renderHome(
  handler: (query: URLSearchParams) => Response = () => listResponse(pageOf([makeCard()], 134)),
  extra: Routes = {},
) {
  const api = mockApi({
    ...publicRoutes(),
    [LIST]: (request) => handler(queryOf(request)),
    ...extra,
  } as Routes)
  const view = renderRoutes(
    [
      { path: '/', element: <HomePage /> },
      { path: '/jobs', element: <p>Job list</p> },
    ],
    { route: '/' },
  )
  return { api, ...view }
}

describe('latest vacancies', () => {
  it('shows skeletons, then the newest vacancies, asking for six newest first', async () => {
    const { api } = renderHome()

    expect(screen.getByText('Loading jobs')).toBeInTheDocument()
    expect(await screen.findByText('Accounts Assistant')).toBeInTheDocument()
    const query = queryOf(api.calls.find((call) => call.path.startsWith('/api/v1/vacancies?'))!)
    expect(query.get('sort')).toBe('newest')
    expect(query.get('page_size')).toBe('6')
  })

  it('links to all jobs with the total', async () => {
    renderHome()

    expect(await screen.findByRole('link', { name: 'See all 134 jobs' })).toHaveAttribute(
      'href',
      '/jobs',
    )
  })

  it('shows three on a phone and six on a wide screen', async () => {
    renderHome(() =>
      listResponse(
        pageOf(
          Array.from({ length: 6 }, (_, i) => makeCard({ id: `v${i}`, title: `Job ${i}` })),
          6,
        ),
      ),
    )
    await screen.findByText('Job 0')

    const latest = screen.getByRole('heading', { name: 'Latest vacancies' }).closest('section')!
    const items = within(latest).getAllByRole('listitem')
    const hiddenOnPhone = items.filter((item) => item.className.includes('max-md:hidden'))
    expect(items).toHaveLength(6)
    expect(hiddenOnPhone.map((item) => item.querySelector('h3')?.textContent)).toEqual([
      'Job 3',
      'Job 4',
      'Job 5',
    ])
  })

  it('has a friendly empty state', async () => {
    renderHome(() => listResponse(pageOf([])))

    expect(await screen.findByText('No vacancies yet')).toBeInTheDocument()
    expect(screen.getByText('Check back soon.')).toBeInTheDocument()
  })

  it('shows an error with Retry, and search still works', async () => {
    renderHome(() => apiError(500, 'internal_error', 'Server error'))

    expect(await screen.findByText('Could not load vacancies')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('What'), 'cook{Enter}')
    expect(await screen.findByText('Job list')).toBeInTheDocument()
  })

  it('recovers when Retry works', async () => {
    let fail = true
    renderHome(() =>
      fail ? apiError(500, 'internal_error', 'Server error') : listResponse(pageOf([makeCard()])),
    )
    await screen.findByText('Could not load vacancies')
    fail = false

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Accounts Assistant')).toBeInTheDocument()
  })
})

describe('search', () => {
  it('sends the words and the district to the job list, in the address', async () => {
    const { router } = renderHome()
    await screen.findByText('Accounts Assistant')

    await userEvent.type(screen.getByLabelText('What'), '  accountant ')
    await waitFor(() => expect(screen.getByLabelText('Where')).toBeEnabled())
    await userEvent.selectOptions(await screen.findByLabelText('Where'), 'Kampala')
    await userEvent.click(screen.getByRole('button', { name: 'Search jobs' }))

    expect(await screen.findByText('Job list')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/jobs')
    expect(router.state.location.search).toBe(`?q=accountant&district_id=${KAMPALA}`)
  })

  it('an empty search just opens the list', async () => {
    const { router } = renderHome()
    await screen.findByText('Accounts Assistant')

    await userEvent.click(screen.getByRole('button', { name: 'Search jobs' }))

    expect(await screen.findByText('Job list')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('offers the districts from the reference list', async () => {
    renderHome()

    const where = await screen.findByLabelText('Where')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Gulu' })).toBeInTheDocument())

    expect(where).toHaveValue('')
    expect(screen.getByRole('option', { name: 'All districts' })).toBeInTheDocument()
  })

  it('popular searches are plain links to filtered results', async () => {
    renderHome()
    await screen.findByText('Accounts Assistant')
    const popular = screen.getByRole('navigation', { name: 'Popular searches' })

    const hrefs = Object.fromEntries(
      Array.from(popular.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]),
    )

    expect(hrefs).toEqual({
      Internships: '/jobs?employment_type=internship',
      'Graduate trainee': '/jobs?q=graduate+trainee',
      'Part-time': '/jobs?employment_type=part_time',
      'IT & software': '/jobs?q=software',
      Accounting: '/jobs?q=accounts',
    })
  })
})

describe('the landing sections', () => {
  it('invites visitors to register as an employer, and sends employers to their dashboard', async () => {
    const visitor = renderHome()
    expect(await screen.findByRole('link', { name: 'Post a vacancy' })).toHaveAttribute(
      'href',
      '/register',
    )
    visitor.unmount()

    renderHome(undefined, loggedIn(makeUser({ role: 'employer' })) as Routes)
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Go to my dashboard' })).toHaveAttribute(
        'href',
        '/employer',
      ),
    )
  })

  it('explains how it works, why to use it, and answers common questions', async () => {
    renderHome()

    expect(await screen.findByRole('heading', { name: 'How it works' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Why use DJMS' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Questions and answers' })).toBeInTheDocument()
    expect(screen.getByText('Who can see my CV and my details?')).toBeInTheDocument()
  })
})
