import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  apiError,
  loggedIn,
  loggedOut,
  makeUser,
  mockApi,
  okData,
  renderRoutes,
} from '../../test/utils'
import { ReportVacancy } from './ReportVacancy'

type Routes = Parameters<typeof mockApi>[0]
const REPORT = 'POST /api/v1/vacancies/v1/reports'
const created = () => okData({ id: 'r1', status: 'open', created_at: '2026-11-06T09:00:00Z' }, 201)

function renderReport(
  routes: Record<string, unknown> = {},
  role: 'job_seeker' | 'employer' | 'admin' | null = 'job_seeker',
) {
  const api = mockApi({
    ...(role ? loggedIn(makeUser({ role })) : loggedOut),
    [REPORT]: created,
    ...routes,
  } as Routes)
  const view = renderRoutes([{ path: '/jobs/:id', element: <ReportVacancy vacancyId="v1" /> }], {
    route: '/jobs/v1?from=list',
  })
  return { api, ...view }
}

const sent = (api: ReturnType<typeof renderReport>['api']) =>
  api.callsTo('POST', '/api/v1/vacancies/v1/reports')
const openDialog = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Report this vacancy' }))
  return screen.findByRole('dialog', { name: 'Report this vacancy' })
}

describe('who sees what', () => {
  it('asks an anonymous visitor to log in, and brings them back', async () => {
    renderReport({}, null)

    const link = await screen.findByRole('link', { name: 'Log in to report this vacancy' })

    expect(link).toHaveAttribute('href', '/login?next=%2Fjobs%2Fv1%3Ffrom%3Dlist')
    expect(screen.queryByRole('button', { name: 'Report this vacancy' })).not.toBeInTheDocument()
  })

  it.each(['job_seeker', 'employer', 'admin'] as const)('a %s can report', async (role) => {
    renderReport({}, role)

    expect(await screen.findByRole('button', { name: 'Report this vacancy' })).toBeVisible()
  })
})

describe('the dialog', () => {
  it('lists the reasons and asks for details', async () => {
    renderReport()
    const dialog = await openDialog()

    for (const label of [
      'Asks for money or a fee',
      'Fake or unknown employer',
      'Misleading or false information',
      'Discriminatory',
      'Something else',
    ]) {
      expect(within(dialog).getByRole('radio', { name: label })).not.toBeChecked()
    }
    expect(within(dialog).getByLabelText('Details (optional)')).toHaveAttribute('maxlength', '2000')
    expect(dialog).toHaveTextContent('The employer is not told who reported')
  })

  it('needs a reason, and sends nothing without one', async () => {
    const { api } = renderReport()
    const dialog = await openDialog()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choose what is wrong.')
    expect(sent(api)).toHaveLength(0)
  })

  it('sends the reason and trimmed details, then thanks the reporter and remembers it', async () => {
    const { api } = renderReport()
    const dialog = await openDialog()

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Asks for money or a fee' }))
    await userEvent.type(
      within(dialog).getByLabelText('Details (optional)'),
      '  Asked for UGX 50,000.  ',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))

    expect(await screen.findByText('Thank you. We will look at it.')).toBeInTheDocument()
    expect(sent(api)[0].body).toEqual({ reason: 'scam_or_fee', details: 'Asked for UGX 50,000.' })
    expect(screen.getByText(/You reported this vacancy/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Report this vacancy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends null when no details were given', async () => {
    const { api } = renderReport()
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Discriminatory' }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))

    await waitFor(() => expect(sent(api)).toHaveLength(1))
    expect(sent(api)[0].body).toEqual({ reason: 'discriminatory', details: null })
  })

  it('"Something else" needs details, and the label says so', async () => {
    const { api } = renderReport()
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Something else' }))
    expect(within(dialog).getByLabelText('Details')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))

    expect(await within(dialog).findByText('Tell us what is wrong.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Details')).toHaveAttribute('aria-invalid', 'true')
    expect(sent(api)).toHaveLength(0)
    await userEvent.type(within(dialog).getByLabelText('Details'), 'The salary is wrong.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    await waitFor(() => expect(sent(api)).toHaveLength(1))
  })

  it('clears the details error as soon as the reporter types', async () => {
    renderReport()
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Something else' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    expect(await within(dialog).findByText('Tell us what is wrong.')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText('Details'), 'T')

    expect(within(dialog).queryByText('Tell us what is wrong.')).not.toBeInTheDocument()
  })

  it('details of only spaces do not count for "Something else"', async () => {
    const { api } = renderReport()
    const dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Something else' }))
    await userEvent.type(within(dialog).getByLabelText('Details'), '    ')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))

    expect(await within(dialog).findByText('Tell us what is wrong.')).toBeInTheDocument()
    expect(sent(api)).toHaveLength(0)
  })

  it('Cancel sends nothing, and the dialog opens empty next time', async () => {
    const { api } = renderReport()
    let dialog = await openDialog()
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Fake or unknown employer' }))
    await userEvent.type(within(dialog).getByLabelText('Details (optional)'), 'half written')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    dialog = await openDialog()

    expect(sent(api)).toHaveLength(0)
    expect(
      within(dialog).getByRole('radio', { name: 'Fake or unknown employer' }),
    ).not.toBeChecked()
    expect(within(dialog).getByLabelText('Details (optional)')).toHaveValue('')
  })
})

describe('when the server says no', () => {
  async function submitWith(routes: Record<string, unknown>) {
    renderReport(routes)
    const dialog = await openDialog()
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Misleading or false information' }),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    return dialog
  }

  it('an earlier report of the same vacancy just shows "You reported this vacancy"', async () => {
    await submitWith({
      [REPORT]: () => apiError(409, 'already_reported', 'You have already reported this vacancy.'),
    })

    expect(await screen.findByText(/You reported this vacancy/)).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('too many reports is explained, and the dialog stays open', async () => {
    const dialog = await submitWith({
      [REPORT]: () => apiError(429, 'rate_limited', 'Too many requests.'),
    })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('sent a lot of reports')
  })

  it('a vacancy that is no longer live is explained', async () => {
    const dialog = await submitWith({
      [REPORT]: () => apiError(404, 'vacancy_not_found', 'This vacancy does not exist.'),
    })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('no longer available')
  })

  it('an employer reporting their own vacancy is told they cannot', async () => {
    const dialog = await submitWith({
      [REPORT]: () =>
        apiError(409, 'cannot_report_own_vacancy', 'You cannot report your own vacancy.'),
    })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'cannot report your own vacancy',
    )
  })

  it('a server problem with the details shows under the box', async () => {
    const dialog = await submitWith({
      [REPORT]: () =>
        apiError(422, 'validation_error', 'Some fields are invalid.', {
          fields: { details: 'The details must be at most 2000 characters.' },
        }),
    })

    expect(await within(dialog).findByText(/at most 2000 characters/)).toBeInTheDocument()
  })

  it('an unexpected error keeps the dialog open with a message', async () => {
    const dialog = await submitWith({
      [REPORT]: () => apiError(500, 'internal_error', 'Something went wrong on our side.'),
    })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side.',
    )
    expect(screen.getByRole('dialog')).toBeVisible()
  })
})
