import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, okData, renderRoutes } from '../../test/utils'
import { JobsPage } from './JobsPage'
import { LIST, listResponse, makeCard, makeDetail, pageOf, publicRoutes } from './testData'

type Routes = Parameters<typeof mockApi>[0]

// A wide screen: the media query for the side pane matches.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('min-width: 1024px'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
})
afterEach(() => vi.unstubAllGlobals())

function renderWide() {
  mockApi({
    ...publicRoutes(),
    [LIST]: () =>
      listResponse(
        pageOf([
          makeCard({ id: 'v1', title: 'Accounts Assistant' }),
          makeCard({ id: 'v2', title: 'Delivery Driver', company_name: 'Nile Basin Logistics' }),
        ]),
      ),
    'GET /api/v1/vacancies/v1': () => okData(makeDetail({ id: 'v1', title: 'Accounts Assistant' })),
    'GET /api/v1/vacancies/v2': () =>
      okData(
        makeDetail({
          id: 'v2',
          title: 'Delivery Driver',
          employer: { company_name: 'Nile Basin Logistics', district_name: 'Gulu' },
        }),
      ),
  } as Routes)
  return renderRoutes(
    [
      { path: '/jobs', element: <JobsPage /> },
      { path: '/jobs/:id', element: <p>Detail page</p> },
    ],
    { route: '/jobs' },
  )
}

describe('the side pane on wide screens', () => {
  it('shows the first job beside the list without leaving the list', async () => {
    const { router } = renderWide()

    const pane = await screen.findByRole('region', { name: 'Selected job' })
    expect(
      await within(pane).findByRole('heading', { name: 'Accounts Assistant', level: 2 }),
    ).toBeVisible()
    expect(within(pane).getByText('Prepare invoices.', { exact: false })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/jobs')
  })

  it('a click on another card swaps the pane and marks that card, without navigating', async () => {
    const { router } = renderWide()
    await screen.findByRole('region', { name: 'Selected job' })

    await userEvent.click(await screen.findByRole('link', { name: /Delivery Driver/ }))

    const pane = screen.getByRole('region', { name: 'Selected job' })
    expect(
      await within(pane).findByRole('heading', { name: 'Delivery Driver', level: 2 }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: /Delivery Driver/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(router.state.location.pathname).toBe('/jobs')
  })
})
