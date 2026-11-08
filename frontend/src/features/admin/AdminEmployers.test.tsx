import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminEmployerDetail, PagedResponse, VerificationStatus } from '../../api/types'
import { apiError, loggedIn, makeUser, mockApi, okData, renderRoutes } from '../../test/utils'
import { makeDetail, makeItem } from '../employers/testData'
import { EmployerDetailPage } from './EmployerDetailPage'
import { EmployerQueuePage } from './EmployerQueuePage'

type Routes = Parameters<typeof mockApi>[0]
const LIST = 'GET /api/v1/admin/employers*'
const admin = () => loggedIn(makeUser({ role: 'admin', email: 'admin@example.com' }))

function page(items: ReturnType<typeof makeItem>[], total = items.length, pageNo = 1): Response {
  const body: PagedResponse<(typeof items)[number]> = {
    data: items,
    meta: { page: pageNo, page_size: 20, total },
  }
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

function renderQueue(routes: Routes, route = '/admin/employers') {
  const api = mockApi({ ...admin(), ...routes })
  const view = renderRoutes(
    [
      { path: '/admin/employers', element: <EmployerQueuePage /> },
      { path: '/admin/employers/:id', element: <p>Detail page</p> },
    ],
    { route },
  )
  return { api, ...view }
}

const listCalls = (api: ReturnType<typeof renderQueue>['api']) =>
  api.calls.filter((call) => call.path.startsWith('/api/v1/admin/employers?')).map((c) => c.path)

describe('employer queue', () => {
  it('opens on the pending filter and lists the employers', async () => {
    const { api } = renderQueue({
      [LIST]: () => page([makeItem('Ssese Foods Ltd'), makeItem('Gulu Hardware')]),
    })

    expect(screen.getByText('Loading employers')).toBeInTheDocument()
    expect(await screen.findByText('Ssese Foods Ltd')).toBeInTheDocument()
    expect(screen.getByText('Gulu Hardware')).toBeInTheDocument()
    expect(screen.getByText('2 employers')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pending', pressed: true })).toBeInTheDocument()
    expect(listCalls(api)[0]).toContain('status=pending')
  })

  it('shows each employer with owner, district, date and a link to the detail', async () => {
    renderQueue({ [LIST]: () => page([makeItem('Ssese Foods Ltd', 'pending', 'e1')]) })

    const link = await screen.findByRole('link', { name: /Ssese Foods Ltd/ })

    expect(link).toHaveAttribute('href', '/admin/employers/e1')
    expect(link).toHaveTextContent('hr@e1.example.com')
    expect(link).toHaveTextContent('Kampala · Sent 6 Nov 2026')
    expect(link).toHaveTextContent('Pending')
  })

  it('filters by status and remembers it in the address', async () => {
    const { api, router } = renderQueue({
      [LIST]: (request) =>
        request.path.includes('status=approved')
          ? page([makeItem('Charlie Ltd', 'approved')])
          : page([makeItem('Ssese Foods Ltd')]),
    })
    await screen.findByText('Ssese Foods Ltd')

    await userEvent.click(screen.getByRole('button', { name: 'Approved' }))

    expect(await screen.findByText('Charlie Ltd')).toBeInTheDocument()
    expect(screen.queryByText('Ssese Foods Ltd')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approved', pressed: true })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?status=approved')
    expect(listCalls(api).at(-1)).toContain('status=approved')
  })

  it('"All" sends no status filter', async () => {
    const { api } = renderQueue({ [LIST]: () => page([makeItem('A Ltd')]) })
    await screen.findByText('A Ltd')

    await userEvent.click(screen.getByRole('button', { name: 'All' }))

    await waitFor(() => expect(listCalls(api).at(-1)).not.toContain('status='))
    expect(listCalls(api).at(-1)).toContain('page=1')
  })

  it('starts from the status in the address, and ignores one it does not know', async () => {
    const first = renderQueue({ [LIST]: () => page([]) }, '/admin/employers?status=suspended')
    await screen.findByText(/No suspended employers/)
    expect(listCalls(first.api)[0]).toContain('status=suspended')
    first.unmount()

    const second = renderQueue({ [LIST]: () => page([]) }, '/admin/employers?status=banned')
    await screen.findByText('No employers waiting')
    expect(listCalls(second.api)[0]).toContain('status=pending')
  })

  it('shows an empty state for the pending queue', async () => {
    renderQueue({ [LIST]: () => page([]) })

    expect(await screen.findByText('No employers waiting')).toBeInTheDocument()
    expect(screen.getByText(/appear here when an employer sends/)).toBeInTheDocument()
  })

  it('shows an error with Retry, and recovers', async () => {
    let fail = true
    renderQueue({
      [LIST]: () =>
        fail ? apiError(500, 'internal_error', 'Server error') : page([makeItem('A Ltd')]),
    })

    expect(await screen.findByText('Could not load employers')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('A Ltd')).toBeInTheDocument()
  })

  it('pages through the list', async () => {
    const { api } = renderQueue({
      [LIST]: (request) => {
        const second = request.path.includes('page=2')
        return second
          ? page([makeItem('Page Two Ltd')], 25, 2)
          : page([makeItem('Page One Ltd')], 25, 1)
      },
    })
    await screen.findByText('Page One Ltd')

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    expect(await screen.findByText('Page Two Ltd')).toBeInTheDocument()
    expect(listCalls(api).at(-1)).toContain('page=2')
    expect(screen.getByText('25 employers')).toBeInTheDocument()
  })

  it('shows no page buttons when everything fits on one page', async () => {
    renderQueue({ [LIST]: () => page([makeItem('A Ltd')], 1) })
    await screen.findByText('A Ltd')

    expect(screen.queryByRole('navigation', { name: 'Employer pages' })).not.toBeInTheDocument()
    expect(screen.getByText('1 employer')).toBeInTheDocument()
  })
})

// ---------- detail ----------

const DETAIL = 'GET /api/v1/admin/employers/e1'
const APPROVE = 'POST /api/v1/admin/employers/e1/approve'
const REJECT = 'POST /api/v1/admin/employers/e1/reject'
const SUSPEND = 'POST /api/v1/admin/employers/e1/suspend'

function renderDetail(detail: AdminEmployerDetail, routes: Routes = {}) {
  let current = detail
  const api = mockApi({
    ...admin(),
    [DETAIL]: () => okData(current),
    ...routes,
  })
  const view = renderRoutes(
    [
      { path: '/admin/employers', element: <p>Queue page</p> },
      { path: '/admin/employers/:id', element: <EmployerDetailPage /> },
    ],
    { route: '/admin/employers/e1' },
  )
  return {
    api,
    setCurrent: (next: AdminEmployerDetail) => {
      current = next
    },
    ...view,
  }
}

const detailWith = (status: VerificationStatus, extra: Partial<AdminEmployerDetail> = {}) =>
  makeDetail({ verification_status: status, ...extra })

describe('employer detail', () => {
  it('shows the profile, the checklist and the history', async () => {
    renderDetail(makeDetail())

    expect(
      await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 }),
    ).toBeInTheDocument()
    const checklist = screen
      .getByRole('heading', { name: 'Checklist' })
      .closest('div') as HTMLElement
    for (const item of [
      'Company name',
      'Registration details',
      'Named contact',
      'Working phone or website',
    ]) {
      expect(
        within(checklist.parentElement as HTMLElement).getByText(new RegExp(item)),
      ).toBeInTheDocument()
    }
    expect(screen.getByText(/80020012345678\. Look it up/)).toBeInTheDocument()
    expect(screen.getByText(/hr@ssese-foods.example.com \(email verified\)/)).toBeInTheDocument()
    expect(screen.getByText('Kampala')).toBeInTheDocument()
    const history = screen.getByRole('list', { name: 'Verification history' })
    expect(history).toHaveTextContent('Sent for checking')
    expect(history).toHaveTextContent('hr@ssese-foods.example.com')
  })

  it('marks what is missing from the checklist, in words as well as colour', async () => {
    renderDetail(makeDetail({ registration_number: null, contact_phone: null, website: null }))
    const heading = await screen.findByRole('heading', { name: 'Checklist' })
    const items = within(heading.parentElement as HTMLElement).getAllByRole('listitem')

    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Company name: provided')
    expect(items[1]).toHaveTextContent('Registration details: missing')
    expect(items[2]).toHaveTextContent('Named contact: provided')
    expect(items[3]).toHaveTextContent('Working phone or website: missing')
  })

  it('lists the history newest first, with reasons', async () => {
    renderDetail(
      detailWith('rejected', {
        history: [
          makeDetail().history[0],
          {
            id: 'h2',
            from_status: 'pending',
            to_status: 'rejected',
            actor_email: 'admin@example.com',
            reason: 'Needs a TIN.',
            created_at: '2026-11-06T08:00:00Z',
          },
        ],
      }),
    )

    const history = await screen.findByRole('list', { name: 'Verification history' })
    const items = within(history).getAllByRole('listitem')

    expect(items[0]).toHaveTextContent('Rejected')
    expect(items[0]).toHaveTextContent('admin@example.com')
    expect(items[0]).toHaveTextContent('Needs a TIN.')
    expect(items[1]).toHaveTextContent('Sent for checking')
  })

  it('shows an empty history for a draft', async () => {
    renderDetail(detailWith('draft', { history: [], submitted_at: null }))

    expect(await screen.findByText(/It has not been sent/)).toBeInTheDocument()
    expect(screen.getByText('Waiting for the employer.')).toBeInTheDocument()
  })

  it('shows a not found message for an unknown employer', async () => {
    mockApi({
      ...admin(),
      [DETAIL]: () => apiError(404, 'employer_not_found', 'This employer does not exist.'),
    })
    renderRoutes([{ path: '/admin/employers/:id', element: <EmployerDetailPage /> }], {
      route: '/admin/employers/e1',
    })

    expect(await screen.findByRole('heading', { name: 'Employer not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to all employers' })).toHaveAttribute(
      'href',
      '/admin/employers',
    )
  })

  it('shows an error with Retry if it cannot be loaded', async () => {
    let fail = true
    mockApi({
      ...admin(),
      [DETAIL]: () =>
        fail ? apiError(500, 'internal_error', 'Server error') : okData(makeDetail()),
    })
    renderRoutes([{ path: '/admin/employers/:id', element: <EmployerDetailPage /> }], {
      route: '/admin/employers/e1',
    })

    expect(await screen.findByText('Could not load this employer')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 }),
    ).toBeInTheDocument()
  })
})

describe('actions by status', () => {
  const buttons = () => screen.queryAllByRole('button').map((b) => b.textContent)

  it.each([
    ['pending', ['Approve', 'Reject…']],
    ['approved', ['Suspend…']],
    ['suspended', ['Approve again']],
    ['draft', []],
    ['rejected', []],
  ] as const)('%s shows %j', async (status, expected) => {
    renderDetail(detailWith(status))
    await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 })

    expect(buttons().filter((text) => /Approve|Reject|Suspend/.test(text ?? ''))).toEqual(expected)
  })
})

describe('approving', () => {
  it('approves without a dialog and shows the new status and history', async () => {
    const { api } = renderDetail(makeDetail(), {
      [APPROVE]: () =>
        okData(
          detailWith('approved', {
            history: [
              ...makeDetail().history,
              {
                id: 'h2',
                from_status: 'pending',
                to_status: 'approved',
                actor_email: 'admin@example.com',
                reason: null,
                created_at: '2026-11-06T09:00:00Z',
              },
            ],
          }),
        ),
    })
    await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('Company approved.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/admin/employers/e1/approve')).toHaveLength(1)
    expect(await screen.findByRole('button', { name: 'Suspend…' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
  })

  it('says so when someone else decided first, and shows the latest state', async () => {
    const view = renderDetail(makeDetail(), {
      [APPROVE]: () => {
        view.setCurrent(detailWith('rejected'))
        return apiError(
          409,
          'invalid_verification_transition',
          'An employer cannot move from rejected to approved.',
        )
      },
    })
    await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'cannot move from rejected to approved',
    )
    expect(await screen.findByText('Waiting for the employer.')).toBeInTheDocument()
  })

  it('shows a toast for an unexpected server error and keeps the buttons', async () => {
    renderDetail(makeDetail(), {
      [APPROVE]: () => apiError(500, 'internal_error', 'Something went wrong on our side.'),
    })
    await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('Something went wrong on our side.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('reinstates a suspended employer', async () => {
    const { api } = renderDetail(detailWith('suspended'), {
      [APPROVE]: () => okData(detailWith('approved')),
    })
    await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'Approve again' }))

    expect(await screen.findByText('Company approved again.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/admin/employers/e1/approve')).toHaveLength(1)
  })
})

describe('rejecting and suspending', () => {
  async function openReject() {
    await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Reject…' }))
    return screen.findByRole('dialog', { name: 'Reject Ssese Foods Ltd?' })
  }

  it('will not reject without a reason, and does not call the API', async () => {
    const { api } = renderDetail(makeDetail())
    const dialog = await openReject()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(
      await within(dialog).findByText('Give a reason. The employer will see it.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Reason/)).toHaveAttribute('aria-invalid', 'true')
    expect(api.callsTo('POST', '/api/v1/admin/employers/e1/reject')).toHaveLength(0)
  })

  it('treats a reason of only spaces as missing', async () => {
    const { api } = renderDetail(makeDetail())
    const dialog = await openReject()

    await userEvent.type(within(dialog).getByLabelText(/Reason/), '    ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(await within(dialog).findByText(/Give a reason/)).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/admin/employers/e1/reject')).toHaveLength(0)
  })

  it('sends the trimmed reason, closes the dialog and shows the result', async () => {
    const { api } = renderDetail(makeDetail(), {
      [REJECT]: () =>
        okData(
          detailWith('rejected', {
            history: [
              ...makeDetail().history,
              {
                id: 'h2',
                from_status: 'pending',
                to_status: 'rejected',
                actor_email: 'admin@example.com',
                reason: 'Needs a TIN.',
                created_at: '2026-11-06T09:00:00Z',
              },
            ],
          }),
        ),
    })
    const dialog = await openReject()

    await userEvent.type(within(dialog).getByLabelText(/Reason/), '  Needs a TIN.  ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(await screen.findByText('Company rejected.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/admin/employers/e1/reject')[0].body).toEqual({
      reason: 'Needs a TIN.',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('list', { name: 'Verification history' })).toHaveTextContent(
      'Needs a TIN.',
    )
  })

  it('starts with an empty box each time the dialog opens', async () => {
    renderDetail(makeDetail())
    let dialog = await openReject()
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'First attempt')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: 'Reject…' }))
    dialog = await screen.findByRole('dialog', { name: 'Reject Ssese Foods Ltd?' })

    expect(within(dialog).getByLabelText(/Reason/)).toHaveValue('')
  })

  it('cancelling sends nothing', async () => {
    const { api } = renderDetail(makeDetail())
    const dialog = await openReject()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(api.callsTo('POST', '/api/v1/admin/employers/e1/reject')).toHaveLength(0)
  })

  it('shows the server message under the box if it refuses the reason', async () => {
    renderDetail(makeDetail(), {
      [REJECT]: () =>
        apiError(422, 'validation_error', 'Some fields are invalid.', {
          fields: { reason: 'The reason must be at most 1000 characters.' },
        }),
    })
    const dialog = await openReject()

    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Too long, says the server')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(await within(dialog).findByText(/at most 1000 characters/)).toBeInTheDocument()
  })

  it('suspends an approved employer with a reason, and warns that live vacancies stay', async () => {
    const { api } = renderDetail(detailWith('approved'), {
      [SUSPEND]: () => okData(detailWith('suspended')),
    })
    await screen.findByRole('heading', { name: 'Ssese Foods Ltd', level: 1 })
    expect(screen.getByText(/already live stay as they are/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Suspend…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Suspend Ssese Foods Ltd?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }))
    expect(await within(dialog).findByText(/Give a reason/)).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Complaints.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }))

    expect(await screen.findByText('Company suspended.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/admin/employers/e1/suspend')[0].body).toEqual({
      reason: 'Complaints.',
    })
    expect(await screen.findByRole('button', { name: 'Approve again' })).toBeInTheDocument()
  })
})
