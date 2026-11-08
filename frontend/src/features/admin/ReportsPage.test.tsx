import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminReport, PagedResponse } from '../../api/types'
import {
  apiError,
  jsonResponse,
  loggedIn,
  makeUser,
  mockApi,
  okData,
  renderRoutes,
} from '../../test/utils'
import { ReportsPage } from './ReportsPage'

type Routes = Parameters<typeof mockApi>[0]
const LIST = 'GET /api/v1/admin/reports*'

function makeReport(overrides: Partial<AdminReport> = {}): AdminReport {
  return {
    id: 'r1',
    reason: 'scam_or_fee',
    details: 'They asked me to pay a fee.',
    status: 'open',
    created_at: '2026-11-06T06:12:00Z',
    handled_at: null,
    reporter_email: 'nakato@example.com',
    open_reports_for_vacancy: 2,
    vacancy: {
      id: 'v1',
      title: 'Earn money fast',
      description: 'Work from home and earn a lot.',
      status: 'published',
      is_live: true,
      company_name: 'Quick Cash Traders',
      employer_id: 'e1',
      employer_status: 'approved',
    },
    ...overrides,
  }
}

function page(items: AdminReport[], total = items.length, pageNo = 1): Response {
  const body: PagedResponse<AdminReport> = {
    data: items,
    meta: { page: pageNo, page_size: 20, total },
  }
  return jsonResponse(body)
}

function renderPage(routes: Record<string, unknown> = {}, route = '/admin/reports') {
  const api = mockApi({
    ...loggedIn(makeUser({ role: 'admin' })),
    [LIST]: () => page([makeReport()]),
    ...routes,
  } as Routes)
  const view = renderRoutes([{ path: '/admin/reports', element: <ReportsPage /> }], { route })
  return { api, ...view }
}

const listCalls = (api: ReturnType<typeof renderPage>['api']) =>
  api.calls
    .filter((call) => call.path.startsWith('/api/v1/admin/reports?'))
    .map((call) => new URLSearchParams(call.path.split('?')[1]))
const review = () => userEvent.click(screen.getByRole('button', { name: /^Review the report/ }))
const dialog = () => screen.findByRole('dialog', { name: 'Review report' })

describe('the list', () => {
  it('opens on open reports and shows what was reported', async () => {
    const { api } = renderPage()

    expect(screen.getByText('Loading reports')).toBeInTheDocument()
    expect(await screen.findByText('Earn money fast')).toBeInTheDocument()
    expect(listCalls(api)[0].get('status')).toBe('open')
    const card = screen.getByRole('listitem')
    expect(card).toHaveTextContent('Quick Cash Traders')
    expect(card).toHaveTextContent('Asks for money or a fee')
    expect(card).toHaveTextContent('They asked me to pay a fee.')
    expect(card).toHaveTextContent('2 open reports')
    expect(card).toHaveTextContent('Reported 6 Nov 2026 by nakato@example.com')
    expect(screen.getByText('1 report')).toBeInTheDocument()
  })

  it('filters by status through the address and the request', async () => {
    const { api, router } = renderPage()
    await screen.findByText('Earn money fast')

    await userEvent.click(screen.getByRole('button', { name: 'Dismissed' }))

    await waitFor(() => expect(listCalls(api).at(-1)!.get('status')).toBe('dismissed'))
    expect(router.state.location.search).toBe('?status=dismissed')
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(listCalls(api).at(-1)!.has('status')).toBe(false))
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('shows handled reports with their outcome and a View button', async () => {
    renderPage(
      { [LIST]: () => page([makeReport({ status: 'dismissed', open_reports_for_vacancy: 0 })]) },
      '/admin/reports?status=dismissed',
    )

    const card = await screen.findByRole('listitem')

    expect(card).toHaveTextContent('Dismissed')
    expect(card).not.toHaveTextContent('open report')
    expect(within(card).getByRole('button', { name: /^Review the report/ })).toHaveTextContent(
      'View',
    )
  })

  it('has an empty state, with a hint for open reports', async () => {
    renderPage({ [LIST]: () => page([]) })

    expect(await screen.findByText('No open reports')).toBeInTheDocument()
    expect(screen.getByText('Reports from job seekers appear here.')).toBeInTheDocument()
  })

  it('names the empty filter', async () => {
    renderPage({ [LIST]: () => page([]) }, '/admin/reports?status=actioned')

    expect(await screen.findByText('No actioned reports')).toBeInTheDocument()
  })

  it('shows an error with Retry, and recovers', async () => {
    let fail = true
    renderPage({
      [LIST]: () => (fail ? apiError(500, 'internal_error', 'Server error') : page([makeReport()])),
    })

    expect(await screen.findByText('Could not load reports')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Earn money fast')).toBeInTheDocument()
  })

  it('pages through a long list', async () => {
    const { api, router } = renderPage({
      [LIST]: (request: { path: string }) => {
        const pageNo = Number(new URLSearchParams(request.path.split('?')[1]).get('page'))
        return page(
          [
            makeReport({
              id: `r${pageNo}`,
              vacancy: { ...makeReport().vacancy, title: `Page ${pageNo} job` },
            }),
          ],
          45,
          pageNo,
        )
      },
    })
    await screen.findByText('Page 1 job')

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    expect(await screen.findByText('Page 2 job')).toBeInTheDocument()
    expect(listCalls(api).at(-1)!.get('page')).toBe('2')
    expect(router.state.location.search).toBe('?page=2')
  })
})

describe('reviewing', () => {
  it('shows the vacancy as people see it, the report, and a link to the public page', async () => {
    renderPage()
    await screen.findByText('Earn money fast')

    await review()
    const box = await dialog()

    expect(box).toHaveTextContent('Earn money fast')
    expect(box).toHaveTextContent('Quick Cash Traders · Live')
    expect(box).toHaveTextContent('Work from home and earn a lot.')
    expect(box).toHaveTextContent('They asked me to pay a fee.')
    expect(within(box).getByRole('link', { name: 'Open the public page' })).toHaveAttribute(
      'href',
      '/jobs/v1',
    )
    expect(within(box).getByRole('link', { name: 'Open the public page' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
  })

  it('dismissing sends the dismissal and refreshes the list', async () => {
    let calls = 0
    const { api } = renderPage({
      [LIST]: () => (calls++ === 0 ? page([makeReport()]) : page([])),
      'POST /api/v1/admin/reports/r1/resolve': () => okData(makeReport({ status: 'dismissed' })),
    })
    await screen.findByText('Earn money fast')
    await review()
    const box = await dialog()

    await userEvent.click(within(box).getByRole('button', { name: 'Dismiss report' }))

    expect(await screen.findByText('Report dismissed.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/admin/reports/r1/resolve')[0].body).toEqual({
      action: 'dismiss',
      suspend_employer: false,
      note: null,
    })
    expect(await screen.findByText('No open reports')).toBeInTheDocument()
  })

  it('"Close vacancy" acts on the report without suspending anyone', async () => {
    const { api } = renderPage({
      'POST /api/v1/admin/reports/r1/resolve': () => okData(makeReport({ status: 'actioned' })),
    })
    await screen.findByText('Earn money fast')
    await review()
    const box = await dialog()

    await userEvent.click(within(box).getByRole('button', { name: 'Close vacancy' }))

    expect(await screen.findByText('Vacancy closed.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/admin/reports/r1/resolve')[0].body).toEqual({
      action: 'action',
      suspend_employer: false,
      note: null,
    })
  })

  it('suspending needs a reason, and sends nothing without one', async () => {
    const { api } = renderPage()
    await screen.findByText('Earn money fast')
    await review()
    const box = await dialog()
    await userEvent.click(
      within(box).getByRole('checkbox', { name: 'Also suspend Quick Cash Traders' }),
    )

    await userEvent.click(within(box).getByRole('button', { name: 'Close vacancy' }))

    expect(
      await within(box).findByText('Give a reason. The employer will see it.'),
    ).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/admin/reports/r1/resolve')).toHaveLength(0)
  })

  it('clears the reason error as soon as the admin types', async () => {
    renderPage()
    await screen.findByText('Earn money fast')
    await review()
    const box = await dialog()
    await userEvent.click(
      within(box).getByRole('checkbox', { name: 'Also suspend Quick Cash Traders' }),
    )
    await userEvent.click(within(box).getByRole('button', { name: 'Close vacancy' }))
    expect(
      await within(box).findByText('Give a reason. The employer will see it.'),
    ).toBeInTheDocument()

    await userEvent.type(within(box).getByLabelText(/Reason/), 'S')

    expect(
      within(box).queryByText('Give a reason. The employer will see it.'),
    ).not.toBeInTheDocument()
  })

  it('closes the vacancy and suspends the company with the reason', async () => {
    const { api } = renderPage({
      'POST /api/v1/admin/reports/r1/resolve': () => okData(makeReport({ status: 'actioned' })),
    })
    await screen.findByText('Earn money fast')
    await review()
    const box = await dialog()
    await userEvent.click(
      within(box).getByRole('checkbox', { name: 'Also suspend Quick Cash Traders' }),
    )
    await userEvent.type(within(box).getByLabelText(/Reason/), '  Several scam reports.  ')

    await userEvent.click(within(box).getByRole('button', { name: 'Close vacancy' }))

    expect(await screen.findByText('Vacancy closed and company suspended.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/admin/reports/r1/resolve')[0].body).toEqual({
      action: 'action',
      suspend_employer: true,
      note: 'Several scam reports.',
    })
  })

  it.each(['pending', 'rejected', 'suspended', 'draft'] as const)(
    'cannot suspend a %s company',
    async (employer_status) => {
      renderPage({
        [LIST]: () => page([makeReport({ vacancy: { ...makeReport().vacancy, employer_status } })]),
      })
      await screen.findByText('Earn money fast')
      await review()
      const box = await dialog()

      const checkbox = within(box).getByRole('checkbox', {
        name: 'Also suspend Quick Cash Traders',
      })

      expect(checkbox).toBeDisabled()
      expect(box).toHaveTextContent('Only an approved company can be suspended.')
    },
  )

  it('a vacancy that is already closed offers "Mark as actioned" and no public link', async () => {
    renderPage({
      [LIST]: () =>
        page([
          makeReport({ vacancy: { ...makeReport().vacancy, status: 'closed', is_live: false } }),
        ]),
    })
    await screen.findByText('Earn money fast')
    await review()
    const box = await dialog()

    expect(within(box).getByRole('button', { name: 'Mark as actioned' })).toBeVisible()
    expect(
      within(box).queryByRole('link', { name: 'Open the public page' }),
    ).not.toBeInTheDocument()
    expect(box).toHaveTextContent('Quick Cash Traders · Closed')
  })

  it('a handled report is view-only', async () => {
    renderPage(
      {
        [LIST]: () =>
          page([makeReport({ status: 'dismissed', handled_at: '2026-11-07T09:00:00Z' })]),
      },
      '/admin/reports?status=dismissed',
    )
    await screen.findByText('Earn money fast')

    await userEvent.click(screen.getByRole('button', { name: /^Review the report/ }))
    const box = await dialog()

    expect(box).toHaveTextContent('This report was dismissed on 7 Nov 2026.')
    expect(within(box).queryByRole('button', { name: 'Dismiss report' })).not.toBeInTheDocument()
    expect(within(box).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('says so when someone else handled it first (409) and refreshes the list', async () => {
    renderPage({
      'POST /api/v1/admin/reports/r1/resolve': () =>
        apiError(409, 'report_already_resolved', 'This report has already been handled.'),
    })
    await screen.findByText('Earn money fast')
    await review()
    const box = await dialog()

    await userEvent.click(within(box).getByRole('button', { name: 'Dismiss report' }))

    expect(await within(box).findByRole('alert')).toHaveTextContent('already been handled')
  })

  it('shows the server message about the reason under the box', async () => {
    renderPage({
      'POST /api/v1/admin/reports/r1/resolve': () =>
        apiError(422, 'reason_required', 'Give a reason. The employer will see it.', {
          fields: { reason: 'Give a reason.' },
        }),
    })
    await screen.findByText('Earn money fast')
    await review()
    const box = await dialog()
    await userEvent.click(
      within(box).getByRole('checkbox', { name: 'Also suspend Quick Cash Traders' }),
    )
    await userEvent.type(within(box).getByLabelText(/Reason/), 'x')

    await userEvent.click(within(box).getByRole('button', { name: 'Close vacancy' }))

    expect(await within(box).findByText('Give a reason.')).toBeInTheDocument()
  })

  it('each report opens with a clean form', async () => {
    renderPage({
      [LIST]: () =>
        page([
          makeReport(),
          makeReport({
            id: 'r2',
            vacancy: { ...makeReport().vacancy, id: 'v2', title: 'Second job' },
          }),
        ]),
    })
    await screen.findByText('Earn money fast')
    await userEvent.click(
      screen.getByRole('button', { name: 'Review the report on Earn money fast' }),
    )
    let box = await dialog()
    await userEvent.click(within(box).getByRole('checkbox', { name: /Also suspend/ }))
    await userEvent.click(within(box).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: 'Review the report on Second job' }))
    box = await dialog()

    expect(within(box).getByRole('checkbox', { name: /Also suspend/ })).not.toBeChecked()
  })

  it('Cancel sends nothing', async () => {
    const { api } = renderPage()
    await screen.findByText('Earn money fast')
    await review()
    const box = await dialog()

    await userEvent.click(within(box).getByRole('button', { name: 'Cancel' }))

    expect(api.callsTo('POST', '/api/v1/admin/reports/r1/resolve')).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
