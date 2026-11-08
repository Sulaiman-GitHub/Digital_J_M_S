import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { VacancyInput } from '../../api/types'
import { addDays, todayInKampala } from '../../lib/dates'
import {
  apiError,
  jsonResponse,
  loggedIn,
  makeUser,
  mockApi,
  okData,
  renderRoutes,
} from '../../test/utils'
import { districts } from '../employers/testData'
import { makeManaged } from '../employers/vacancies/testData'
import { makeItem } from '../employers/testData'
import { AdminVacancyPage } from './AdminVacancyPage'

type Routes = Parameters<typeof mockApi>[0]
const PARTNERS = 'GET /api/v1/admin/employers*'
const CREATE = 'POST /api/v1/admin/vacancies'

function partners(
  items = [
    makeItem('Gulu Hardware', 'approved', 'gulu'),
    makeItem('Nile Logistics', 'approved', 'nile'),
  ],
) {
  return jsonResponse({ data: items, meta: { page: 1, page_size: 50, total: items.length } })
}

function renderPage(routes: Record<string, unknown> = {}) {
  const api = mockApi({
    ...loggedIn(makeUser({ role: 'admin' })),
    'GET /api/v1/reference/districts': () => okData(districts),
    'GET /api/v1/reference/qualification-levels': () => okData([]),
    'GET /api/v1/reference/skills?q=*': () => okData([]),
    [PARTNERS]: () => partners(),
    ...routes,
  } as Routes)
  const view = renderRoutes(
    [
      { path: '/admin/employers', element: <p>Employer queue</p> },
      { path: '/admin/vacancies/new', element: <AdminVacancyPage /> },
    ],
    { route: '/admin/vacancies/new' },
  )
  return { api, ...view }
}

const created = (api: ReturnType<typeof renderPage>['api']) =>
  api.callsTo('POST', '/api/v1/admin/vacancies')
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))

async function fillComplete() {
  await userEvent.type(await screen.findByLabelText('Job title'), 'Store Manager')
  await userEvent.selectOptions(screen.getByLabelText('Job type'), 'Full-time')
  await userEvent.click(screen.getByRole('radio', { name: 'On-site' }))
  await userEvent.selectOptions(screen.getByLabelText('District'), 'Gulu')
  await userEvent.type(screen.getByLabelText('About the job'), 'Run the store.')
  fireEvent.change(screen.getByLabelText('Applications close on'), {
    target: { value: addDays(todayInKampala(), 20) },
  })
}

describe('the partner vacancy form', () => {
  it('lists only the approved employers, asked for by status', async () => {
    const { api } = renderPage()

    const select = await screen.findByLabelText('Partner employer')

    expect(screen.getByRole('option', { name: /Gulu Hardware/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Nile Logistics/ })).toBeInTheDocument()
    expect(select).toHaveValue('')
    const call = api.calls.find((item) => item.path.startsWith('/api/v1/admin/employers?'))!
    expect(new URLSearchParams(call.path.split('?')[1]).get('status')).toBe('approved')
  })

  it('needs an employer, and sends nothing without one', async () => {
    const { api } = renderPage()
    await userEvent.type(await screen.findByLabelText('Job title'), 'Store Manager')

    await click('Save draft')

    expect(await screen.findByText('Choose the partner employer')).toBeInTheDocument()
    expect(created(api)).toHaveLength(0)
  })

  it('creates a draft for the chosen employer', async () => {
    const { api, router } = renderPage({
      [CREATE]: () => okData(makeManaged({ created_by_admin: true }), 201),
    })
    await userEvent.type(await screen.findByLabelText('Job title'), 'Store Manager')
    await userEvent.selectOptions(screen.getByLabelText('Partner employer'), 'nile')

    await click('Save draft')

    expect(await screen.findByText('Draft created for the partner.')).toBeInTheDocument()
    expect(created(api)[0].body).toMatchObject({
      employer_id: 'nile',
      publish: false,
      title: 'Store Manager',
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/employers'))
  })

  it('"Create and publish" checks the vacancy is complete first', async () => {
    const { api } = renderPage()
    await userEvent.type(await screen.findByLabelText('Job title'), 'Store Manager')
    await userEvent.selectOptions(screen.getByLabelText('Partner employer'), 'gulu')

    await click('Create and publish')

    await waitFor(() =>
      expect(screen.getByLabelText('About the job')).toHaveAccessibleDescription(
        'Describe the job',
      ),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Complete the fields marked in red')
    expect(created(api)).toHaveLength(0)
  })

  it('creates and publishes in one step', async () => {
    const { api, router } = renderPage({
      [CREATE]: () => okData(makeManaged({ status: 'published', is_live: true }), 201),
    })
    await fillComplete()
    await userEvent.selectOptions(screen.getByLabelText('Partner employer'), 'gulu')

    await click('Create and publish')

    expect(await screen.findByText('Vacancy created and published.')).toBeInTheDocument()
    const body = created(api)[0].body as VacancyInput & { employer_id: string; publish: boolean }
    expect(body).toMatchObject({
      employer_id: 'gulu',
      publish: true,
      title: 'Store Manager',
      employment_type: 'full_time',
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/employers'))
  })

  it('shows the server refusal when the employer is no longer approved', async () => {
    renderPage({
      [CREATE]: () =>
        apiError(
          409,
          'employer_not_verified',
          'A vacancy can only be created for an approved employer.',
        ),
    })
    await userEvent.type(await screen.findByLabelText('Job title'), 'Store Manager')
    await userEvent.selectOptions(screen.getByLabelText('Partner employer'), 'gulu')

    await click('Save draft')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'only be created for an approved employer',
    )
  })

  it('says so when there are no approved employers', async () => {
    renderPage({ [PARTNERS]: () => partners([]) })

    expect(await screen.findByText(/no approved employers yet/i)).toBeInTheDocument()
  })

  it('shows an error with Retry if the employers cannot be loaded', async () => {
    let fail = true
    renderPage({
      [PARTNERS]: () => (fail ? apiError(500, 'internal_error', 'Server error') : partners()),
    })

    expect(await screen.findByText('Could not load the form')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByLabelText('Partner employer')).toBeInTheDocument()
  })
})
