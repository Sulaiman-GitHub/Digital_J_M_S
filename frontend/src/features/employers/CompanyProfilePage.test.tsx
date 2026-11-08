import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Employer, EmployerInput } from '../../api/types'
import { apiError, mockApi, okData, renderRoutes } from '../../test/utils'
import { CompanyProfilePage } from './CompanyProfilePage'
import { KAMPALA, PUT_EMPLOYER, SUBMIT_EMPLOYER, employerRoutes, makeEmployer } from './testData'

type Routes = Parameters<typeof mockApi>[0]

function renderPage(
  employer: Employer | null = null,
  options: { emailVerified?: boolean; extra?: Routes } = {},
) {
  const api = mockApi({
    [PUT_EMPLOYER]: (request) =>
      okData(
        makeEmployer({ ...(request.body as EmployerInput), verification_status: 'draft' } as never),
      ),
    ...(employerRoutes(employer, { emailVerified: options.emailVerified }) as Routes),
    ...options.extra,
  })
  const view = renderRoutes([{ path: '/employer/profile', element: <CompanyProfilePage /> }], {
    route: '/employer/profile',
  })
  return { api, ...view }
}

const puts = (api: ReturnType<typeof renderPage>['api']) =>
  api.callsTo('PUT', '/api/v1/employer/me')
const field = (label: string) => screen.findByLabelText(label)
const click = (name: string | RegExp) => userEvent.click(screen.getByRole('button', { name }))

async function fillRequired() {
  await userEvent.type(await field('Company name'), 'Ssese Foods Ltd')
  await userEvent.selectOptions(screen.getByLabelText('District'), 'Kampala')
}

describe('loading and errors', () => {
  it('shows a status while loading, then the empty form', async () => {
    renderPage()

    expect(screen.getByText('Loading your company profile')).toBeInTheDocument()
    expect(await field('Company name')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('shows an error with Retry, and recovers', async () => {
    let fail = true
    renderPage(null, {
      extra: {
        'GET /api/v1/employer/me': () =>
          fail
            ? apiError(500, 'internal_error', 'Server error')
            : apiError(404, 'employer_not_found', 'none'),
      },
    })

    expect(await screen.findByText('Could not load your company profile')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await field('Company name')).toBeInTheDocument()
  })

  it('fills the form from the saved profile', async () => {
    renderPage(makeEmployer())

    expect(await field('Company name')).toHaveValue('Ssese Foods Ltd')
    expect(screen.getByLabelText('Registration number')).toHaveValue('80020012345678')
    expect(screen.getByLabelText('Phone')).toHaveValue('+256414123456')
    expect(screen.getByLabelText('District')).toHaveValue(KAMPALA)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('checks the fields on the client without calling the API', async () => {
    const { api } = renderPage()
    await field('Company name')

    await click('Save')

    expect(await screen.findByText('Enter the company name')).toBeInTheDocument()
    expect(screen.getByLabelText('District')).toHaveAccessibleDescription('Choose a district')
    expect(puts(api)).toHaveLength(0)
  })

  it.each([
    ['Phone', '12345', /Enter a Ugandan phone number/],
    ['Website (optional)', 'ssese.example.com', /starting with https/],
    ['Website (optional)', 'javascript:alert(1)', /starting with https/],
    ['Company name', 'A', /at least 2 letters/],
  ])('refuses a bad %s (%s)', async (label, value, message) => {
    const { api } = renderPage()
    await fillRequired()
    const input = screen.getByLabelText(label)
    await userEvent.clear(input)
    await userEvent.type(input, value)

    await click('Save')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(puts(api)).toHaveLength(0)
  })

  it('creates the draft with only a name and a district, sending empty fields as null', async () => {
    const { api } = renderPage()
    await fillRequired()

    await click('Save')

    expect(await screen.findByText('Company profile saved.')).toBeInTheDocument()
    expect(puts(api)[0].body).toEqual({
      company_name: 'Ssese Foods Ltd',
      registration_number: null,
      website: null,
      contact_phone: null,
      district_id: KAMPALA,
      description: null,
    })
  })

  it('trims what is typed', async () => {
    const { api } = renderPage()
    await fillRequired()
    await userEvent.type(screen.getByLabelText('Registration number'), '  800200  ')
    await userEvent.type(screen.getByLabelText('Phone'), ' 0414 123456 ')

    await click('Save')

    await waitFor(() => expect(puts(api)).toHaveLength(1))
    expect(puts(api)[0].body).toMatchObject({
      registration_number: '800200',
      contact_phone: '0414 123456',
    })
  })

  it('shows server field errors on the matching inputs', async () => {
    renderPage(null, {
      extra: {
        [PUT_EMPLOYER]: () =>
          apiError(422, 'validation_error', 'Some fields are invalid.', {
            fields: { registration_number: 'That registration number is not valid.' },
          }),
      },
    })
    await fillRequired()

    await click('Save')

    expect(await screen.findByLabelText('Registration number')).toHaveAccessibleDescription(
      /not valid/,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Fix the fields marked in red')
  })

  it('tells an approved employer when a change sends the profile back for checking', async () => {
    renderPage(makeEmployer({ verification_status: 'approved', can_publish: true }), {
      extra: {
        [PUT_EMPLOYER]: () =>
          okData(makeEmployer({ verification_status: 'pending', company_name: 'New Name Ltd' })),
      },
    })
    const name = await field('Company name')
    await userEvent.clear(name)
    await userEvent.type(name, 'New Name Ltd')

    await click('Save changes')

    expect(await screen.findByText(/we will check your company again/)).toBeInTheDocument()
  })

  it('warns an approved employer before they change the name', async () => {
    renderPage(makeEmployer({ verification_status: 'approved', can_publish: true }))

    expect(
      await screen.findByText(
        /Changing the company name or registration number sends the profile back/,
      ),
    ).toBeInTheDocument()
  })
})

describe('read-only states', () => {
  it.each(['pending', 'suspended'] as const)('is read-only while %s', async (status) => {
    renderPage(makeEmployer({ verification_status: status }))

    expect(await field('Company name')).toBeDisabled()
    expect(screen.getByLabelText('District')).toBeDisabled()
    expect(screen.getByText(/read-only/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Submit for verification' }),
    ).not.toBeInTheDocument()
  })

  it('can be edited and resubmitted after a rejection', async () => {
    renderPage(makeEmployer({ verification_status: 'rejected', status_reason: 'Unclear.' }))

    expect(await field('Company name')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Submit for verification' })).toBeInTheDocument()
  })

  it('offers no Submit button once approved', async () => {
    renderPage(makeEmployer({ verification_status: 'approved', can_publish: true }))

    await field('Company name')

    expect(
      screen.queryByRole('button', { name: 'Submit for verification' }),
    ).not.toBeInTheDocument()
  })
})

describe('submitting for verification', () => {
  const submitButton = () => screen.getByRole('button', { name: 'Submit for verification' })

  it('is blocked, with the reason, until the profile is saved', async () => {
    const { api } = renderPage()
    await field('Company name')

    expect(submitButton()).toHaveAttribute('aria-disabled', 'true')
    expect(submitButton()).toHaveAccessibleDescription(/Save your profile first/)
    await userEvent.click(submitButton())

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/employer/me/submit')).toHaveLength(0)
  })

  it('is blocked while there are unsaved changes', async () => {
    renderPage(makeEmployer())
    await userEvent.type(await field('Company name'), 'X')

    expect(submitButton()).toHaveAttribute('aria-disabled', 'true')
    expect(submitButton()).toHaveAccessibleDescription(/Save your changes first/)
  })

  it('is blocked when the email is not verified', async () => {
    renderPage(makeEmployer(), { emailVerified: false })
    await field('Company name')

    expect(submitButton()).toHaveAttribute('aria-disabled', 'true')
    expect(submitButton()).toHaveAccessibleDescription(/Verify your email address first/)
  })

  it.each([
    [{ registration_number: null }, /Add the registration number, then save/],
    [{ description: null }, /Add a description, then save/],
    [{ contact_phone: null, website: null }, /Add a phone number or a website, then save/],
    [
      { registration_number: null, description: null, contact_phone: null, website: null },
      /Add the registration number, a description, a phone number or a website/,
    ],
  ])('is blocked, saying what to add, when %j is missing', async (missing, message) => {
    const { api } = renderPage(makeEmployer(missing))
    await field('Company name')

    expect(submitButton()).toHaveAttribute('aria-disabled', 'true')
    expect(submitButton()).toHaveAccessibleDescription(message)
    await userEvent.click(submitButton())

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/employer/me/submit')).toHaveLength(0)
  })

  it('a phone alone or a website alone is enough', async () => {
    renderPage(makeEmployer({ website: null }))
    await field('Company name')

    expect(submitButton()).not.toHaveAttribute('aria-disabled')
  })

  it('asks for confirmation, and does nothing if cancelled', async () => {
    const { api } = renderPage(makeEmployer())
    await field('Company name')

    await userEvent.click(submitButton())
    const dialog = await screen.findByRole('dialog', { name: 'Submit for verification?' })
    expect(dialog).toHaveTextContent('You cannot edit your profile while we check it.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(api.callsTo('POST', '/api/v1/employer/me/submit')).toHaveLength(0)
  })

  it('sends it after confirming and shows the result', async () => {
    const { api } = renderPage(makeEmployer(), {
      extra: {
        [SUBMIT_EMPLOYER]: () =>
          okData(
            makeEmployer({ verification_status: 'pending', submitted_at: '2026-11-06T06:12:00Z' }),
          ),
      },
    })
    await field('Company name')

    await userEvent.click(submitButton())
    const dialog = await screen.findByRole('dialog', { name: 'Submit for verification?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Sent for verification.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/employer/me/submit')).toHaveLength(1)
    await waitFor(() => expect(screen.getByLabelText('Company name')).toBeDisabled())
  })

  it('shows what is missing when the server says the profile is incomplete', async () => {
    renderPage(makeEmployer(), {
      extra: {
        [SUBMIT_EMPLOYER]: () =>
          apiError(
            422,
            'profile_incomplete',
            'Complete your company profile before submitting it.',
            {
              fields: {
                registration_number: 'Enter your company registration number.',
                description: 'Describe what your company does.',
              },
            },
          ),
      },
    })
    await field('Company name')

    await userEvent.click(submitButton())
    const dialog = await screen.findByRole('dialog', { name: 'Submit for verification?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit' }))

    expect(await screen.findByLabelText('Registration number')).toHaveAccessibleDescription(
      /Enter your company registration number/,
    )
    expect(screen.getByLabelText('What does your company do?')).toHaveAccessibleDescription(
      /Describe what your company does/,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Complete the fields marked in red')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
