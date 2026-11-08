import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, loggedIn, makeUser, mockApi, okData, renderRoutes } from '../../test/utils'
import { AccountPage } from './AccountPage'

const EXPORT = 'GET /api/v1/account/export'
const DELETE = 'DELETE /api/v1/account'

afterEach(() => vi.restoreAllMocks())

function renderAccount(role: 'job_seeker' | 'employer' | 'admin' = 'employer', routes = {}) {
  const api = mockApi({
    ...loggedIn(makeUser({ role })),
    [EXPORT]: () => okData({ account: { email: 'nakato@example.com' } }),
    [DELETE]: () => new Response(null, { status: 204 }),
    ...routes,
  } as Parameters<typeof mockApi>[0])
  const view = renderRoutes(
    [
      { path: '/account', element: <AccountPage /> },
      { path: '/', element: <p>Home page</p> },
    ],
    { route: '/account' },
  )
  return { api, ...view }
}

async function openDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'Delete my account…' }))
  return screen.findByRole('dialog', { name: 'Delete your account?' })
}

describe('your data', () => {
  it.each(['job_seeker', 'employer'] as const)('is offered to a %s', async (role) => {
    renderAccount(role)

    expect(await screen.findByRole('heading', { name: 'Your data' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download my data' })).toBeVisible()
  })

  it('is not offered to an admin', async () => {
    renderAccount('admin')
    await screen.findByRole('heading', { name: 'My account' })

    expect(screen.queryByRole('heading', { name: 'Your data' })).not.toBeInTheDocument()
  })

  it('downloads the data as a JSON file', async () => {
    const create = vi.fn(() => 'blob:fake')
    vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { api } = renderAccount()

    await userEvent.click(await screen.findByRole('button', { name: 'Download my data' }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(api.callsTo('GET', '/api/v1/account/export')).toHaveLength(1)
    expect(create).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('says so when the download fails', async () => {
    renderAccount('employer', { [EXPORT]: () => apiError(500, 'internal_error', 'Oops') })

    await userEvent.click(await screen.findByRole('button', { name: 'Download my data' }))

    expect(await screen.findByText(/We could not prepare your data/)).toBeVisible()
  })
})

describe('deleting the account', () => {
  it('warns clearly and changes nothing if the person keeps the account', async () => {
    const { api } = renderAccount()
    const dialog = await openDialog()

    expect(within(dialog).getByText(/cannot be undone/)).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep my account' }))

    expect(api.callsTo('DELETE', '/api/v1/account')).toHaveLength(0)
  })

  it('needs the password', async () => {
    const { api } = renderAccount()
    const dialog = await openDialog()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }))

    expect(await within(dialog).findByText('Enter your password to confirm.')).toBeVisible()
    expect(api.callsTo('DELETE', '/api/v1/account')).toHaveLength(0)
  })

  it('deletes, logs out and goes to the home page', async () => {
    const { api } = renderAccount()
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'Kampala-Sunrise-42')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }))

    expect(await screen.findByText('Home page')).toBeVisible()
    expect(api.callsTo('DELETE', '/api/v1/account')[0].body).toEqual({
      password: 'Kampala-Sunrise-42',
    })
    expect(await screen.findByText('Your account was deleted.')).toBeVisible()
  })

  it('says the password is wrong and keeps the dialog open', async () => {
    renderAccount('job_seeker', {
      [DELETE]: () => apiError(403, 'wrong_password', 'That password is not correct.'),
    })
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'nope')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }))

    expect(await within(dialog).findByText('That password is not correct.')).toBeVisible()
    expect(screen.queryByText('Home page')).not.toBeInTheDocument()
  })

  it('tells an employer with live vacancies to close them first', async () => {
    renderAccount('employer', {
      [DELETE]: () => apiError(409, 'live_vacancies', 'Close your live vacancies first.'),
    })
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByLabelText('Your password'), 'Kampala-Sunrise-42')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }))

    expect(await within(dialog).findByText(/Close them first/)).toBeVisible()
  })
})
