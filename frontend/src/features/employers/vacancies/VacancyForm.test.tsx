import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Outlet } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { VacancyInput } from '../../../api/types'
import { addDays, dayInKampala, todayInKampala } from '../../../lib/dates'
import { apiError, mockApi, okData, renderRoutes } from '../../../test/utils'
import { EmployerVacancyFormPage } from './EmployerVacancyFormPage'
import { CREATE, KAMPALA, makeManaged, vacancyRoutes } from './testData'

type Routes = Parameters<typeof mockApi>[0]

function Shell() {
  return (
    <>
      <Link to="/employer">Leave page</Link>
      <Outlet />
    </>
  )
}

function renderForm(routes: Record<string, unknown>, route = '/employer/vacancies/new') {
  const api = mockApi(routes as Routes)
  const view = renderRoutes(
    [
      {
        element: <Shell />,
        children: [
          { path: '/employer', element: <p>Dashboard page</p> },
          { path: '/employer/vacancies/new', element: <EmployerVacancyFormPage /> },
          { path: '/employer/vacancies/:id', element: <EmployerVacancyFormPage /> },
        ],
      },
    ],
    { route },
  )
  return { api, ...view }
}

const field = (label: string | RegExp) => screen.findByLabelText(label)
const click = (name: string | RegExp) => userEvent.click(screen.getByRole('button', { name }))
const posts = (api: ReturnType<typeof renderForm>['api']) =>
  api.callsTo('POST', '/api/v1/employer/vacancies')
const body = (call: { body: unknown }) => call.body as VacancyInput
const soon = (days = 10) => addDays(todayInKampala(), days)

/** Everything a vacancy needs to go live. */
async function fillComplete(closing = soon()) {
  await userEvent.type(await field('Job title'), 'Accounts Assistant')
  await userEvent.selectOptions(screen.getByLabelText('Job type'), 'Full-time')
  await userEvent.click(screen.getByRole('radio', { name: 'On-site' }))
  await userEvent.selectOptions(screen.getByLabelText('District'), 'Kampala')
  await userEvent.type(screen.getByLabelText('About the job'), 'Prepare invoices.')
  fireEvent.change(screen.getByLabelText('Applications close on'), { target: { value: closing } })
}

const savedDraft = makeManaged({ id: 'v1', status: 'draft' })

describe('a new vacancy', () => {
  it('shows every section, and a Save draft button', async () => {
    renderForm(vacancyRoutes())

    expect(await screen.findByRole('heading', { name: 'New vacancy', level: 1 })).toBeVisible()
    for (const section of [
      'Basics',
      'Pay and experience',
      'Requirements',
      'How people apply',
      'Closing date',
    ]) {
      expect(screen.getByRole('region', { name: section })).toBeVisible()
    }
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeVisible()
  })

  it('needs a title to save a draft, and sends nothing without one', async () => {
    const { api } = renderForm(vacancyRoutes())
    await field('Job title')

    await click('Save draft')

    expect(await screen.findByText('Enter the job title')).toBeInTheDocument()
    expect(screen.getByLabelText('Job title')).toHaveAttribute('aria-invalid', 'true')
    expect(posts(api)).toHaveLength(0)
  })

  it('saves a draft with only a title, sending empty fields as null, then opens it for editing', async () => {
    const { api, router } = renderForm({
      ...vacancyRoutes(),
      [CREATE]: () => okData({ ...savedDraft, title: 'Driver' }, 201),
      'GET /api/v1/employer/vacancies/v1': () => okData({ ...savedDraft, title: 'Driver' }),
    })
    await userEvent.type(await field('Job title'), 'Driver')

    await click('Save draft')

    expect(await screen.findByText('Draft saved.')).toBeInTheDocument()
    expect(body(posts(api)[0])).toMatchObject({
      title: 'Driver',
      description: null,
      employment_type: null,
      work_arrangement: null,
      district_id: null,
      expires_at: null,
      application_method: 'internal',
      external_url: null,
      requirements: [],
      min_experience_years: 0,
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/employer/vacancies/v1'))
  })

  it('shows server field errors on the matching fields', async () => {
    renderForm({
      ...vacancyRoutes(),
      [CREATE]: () =>
        apiError(422, 'validation_error', 'Some fields are invalid.', {
          fields: {
            salary_max: 'The highest salary cannot be lower than the lowest.',
            expires_at: 'Choose a closing date in the future.',
          },
        }),
    })
    await userEvent.type(await field('Job title'), 'Driver')

    await click('Save draft')

    expect(await screen.findByLabelText('Highest pay (UGX)')).toHaveAccessibleDescription(
      /cannot be lower/,
    )
    expect(screen.getByLabelText('Applications close on')).toHaveAccessibleDescription(
      /in the future/,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Fix the fields marked in red')
  })

  it('warns before leaving with unsaved changes', async () => {
    renderForm(vacancyRoutes())
    await userEvent.type(await field('Job title'), 'Dri')

    await userEvent.click(screen.getByRole('link', { name: 'Leave page' }))

    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
  })

  it('does not warn when nothing was changed', async () => {
    renderForm(vacancyRoutes())
    await field('Job title')

    await userEvent.click(screen.getByRole('link', { name: 'Leave page' }))

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument()
  })
})

describe('validation', () => {
  it.each([
    ['Lowest pay (UGX)', '-5', /whole number of shillings/],
    ['Lowest pay (UGX)', '1.5', /whole number of shillings/],
    ['Highest pay (UGX)', 'lots', /whole number of shillings/],
    ['Years of experience', '51', /from 0 to 50/],
    ['Years of experience', 'two', /from 0 to 50/],
    ['Job title', 'ab', /at least 3 letters/],
  ])('%s = %s is refused', async (label, value, message) => {
    const { api } = renderForm(vacancyRoutes())
    await userEvent.type(await field('Job title'), 'Driver')
    const input = screen.getByLabelText(label)
    await userEvent.clear(input)
    await userEvent.type(input, value)

    await click('Save draft')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(posts(api)).toHaveLength(0)
  })

  it('the highest pay cannot be lower than the lowest', async () => {
    const { api } = renderForm(vacancyRoutes())
    await userEvent.type(await field('Job title'), 'Driver')
    await userEvent.type(screen.getByLabelText('Lowest pay (UGX)'), '2000000')
    await userEvent.type(screen.getByLabelText('Highest pay (UGX)'), '1000000')

    await click('Save draft')

    expect(
      await screen.findByText('The highest pay cannot be lower than the lowest'),
    ).toBeInTheDocument()
    expect(posts(api)).toHaveLength(0)
  })

  it('offers closing dates from today to 89 days ahead only', async () => {
    renderForm(vacancyRoutes())

    const date = await field('Applications close on')

    expect(date).toHaveAttribute('type', 'date')
    expect(date).toHaveAttribute('min', todayInKampala())
    expect(date).toHaveAttribute('max', addDays(todayInKampala(), 89))
  })

  it('refuses a closing date past the limit', async () => {
    const { api } = renderForm(vacancyRoutes())
    await userEvent.type(await field('Job title'), 'Driver')
    fireEvent.change(screen.getByLabelText('Applications close on'), {
      target: { value: addDays(todayInKampala(), 120) },
    })

    await click('Save draft')

    expect(await screen.findByText(/Choose a date from today/)).toBeInTheDocument()
    expect(posts(api)).toHaveLength(0)
  })

  it('shows the link field only for vacancies applied for on another website, and checks it', async () => {
    const { api } = renderForm(vacancyRoutes())
    await userEvent.type(await field('Job title'), 'Driver')
    expect(screen.queryByLabelText('Link where people apply')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'On another website' }))
    const link = await field('Link where people apply')
    await userEvent.type(link, 'http://insecure.example.com')
    await click('Save draft')

    expect(await screen.findByText('Enter a link starting with https://')).toBeInTheDocument()
    expect(posts(api)).toHaveLength(0)
  })

  it('counts the description and refuses an over-long one', async () => {
    renderForm(vacancyRoutes())
    await userEvent.type(await field('About the job'), 'Hello')

    expect(screen.getByText('5 of 10000')).toBeInTheDocument()
  })
})

describe('requirements', () => {
  it('lets the employer pick skills and mark each Required or Preferred', async () => {
    const { api } = renderForm({
      ...vacancyRoutes(),
      [CREATE]: () => okData(savedDraft, 201),
      'GET /api/v1/employer/vacancies/v1': () => okData(savedDraft),
    })
    await userEvent.type(await field('Job title'), 'Analyst')

    await userEvent.type(screen.getByRole('combobox', { name: 'Skills' }), 'ex')
    await userEvent.click(await screen.findByRole('option', { name: 'Microsoft Excel' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Skills' }), 'py')
    await userEvent.click(await screen.findByRole('option', { name: 'Python' }))
    const list = await screen.findByRole('list', { name: 'Skill requirements' })
    const required = within(list).getByRole('checkbox', { name: 'Microsoft Excel: required' })
    expect(required).not.toBeChecked() // preferred until toggled
    await userEvent.click(required)
    expect(required).toBeChecked()
    await click('Save draft')

    await waitFor(() => expect(posts(api)).toHaveLength(1))
    expect(body(posts(api)[0]).requirements).toEqual([
      { kind: 'skill', skill_id: 'sk1', label: null, is_mandatory: true },
      { kind: 'skill', skill_id: 'sk2', label: null, is_mandatory: false },
    ])
  })

  it('removing a skill removes its row', async () => {
    renderForm(vacancyRoutes())
    await userEvent.type(await screen.findByRole('combobox', { name: 'Skills' }), 'ex')
    await userEvent.click(await screen.findByRole('option', { name: 'Microsoft Excel' }))
    await screen.findByRole('list', { name: 'Skill requirements' })

    await userEvent.click(screen.getByRole('button', { name: /Remove Microsoft Excel/ }))

    expect(screen.queryByRole('list', { name: 'Skill requirements' })).not.toBeInTheDocument()
  })

  it('adds typed requirements with a type, a text and a Required toggle, and can remove them', async () => {
    const { api } = renderForm({
      ...vacancyRoutes(),
      [CREATE]: () => okData(savedDraft, 201),
      'GET /api/v1/employer/vacancies/v1': () => okData(savedDraft),
    })
    await userEvent.type(await field('Job title'), 'Analyst')

    await click('Add a requirement')
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'Certification')
    await userEvent.type(screen.getByLabelText('Requirement'), 'CPA Part 1')
    await userEvent.click(screen.getByRole('checkbox', { name: 'CPA Part 1: required' }))
    await click('Add a requirement')
    await userEvent.type(screen.getAllByLabelText('Requirement')[1], 'Own motorbike')
    await click('Remove Own motorbike')
    expect(screen.getByText('1 of 20 requirements.')).toBeInTheDocument()
    await click('Save draft')

    await waitFor(() => expect(posts(api)).toHaveLength(1))
    expect(body(posts(api)[0]).requirements).toEqual([
      { kind: 'certification', skill_id: null, label: 'CPA Part 1', is_mandatory: true },
    ])
  })

  it('a typed requirement needs its text', async () => {
    const { api } = renderForm(vacancyRoutes())
    await userEvent.type(await field('Job title'), 'Analyst')
    await click('Add a requirement')

    await click('Save draft')

    expect(await screen.findByText('Describe the requirement')).toBeInTheDocument()
    expect(posts(api)).toHaveLength(0)
  })

  it('stops at twenty requirements', async () => {
    renderForm(vacancyRoutes())
    await field('Job title')

    for (let index = 0; index < 20; index += 1) await click('Add a requirement')

    expect(screen.getByText('20 of 20 requirements.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a requirement' })).toBeDisabled()
  })

  it('shows the server message about the requirements as a whole', async () => {
    renderForm({
      ...vacancyRoutes(),
      [CREATE]: () =>
        apiError(422, 'validation_error', 'Some fields are invalid.', {
          fields: { 'requirements.0.skill_id': 'Choose a skill from the list.' },
        }),
    })
    await userEvent.type(await field('Job title'), 'Analyst')

    await click('Save draft')

    expect(await screen.findByText('Choose a skill from the list.')).toBeInTheDocument()
  })
})

describe('publishing', () => {
  it('is disabled, with the reason, until the company is approved, but saving a draft works', async () => {
    const { api } = renderForm({
      ...vacancyRoutes('pending'),
      [CREATE]: () => okData(savedDraft, 201),
      'GET /api/v1/employer/vacancies/v1': () => okData(savedDraft),
    })
    await userEvent.type(await field('Job title'), 'Driver')
    const publish = screen.getByRole('button', { name: 'Publish' })

    await waitFor(() =>
      expect(publish).toHaveAccessibleDescription(/finished checking your company/),
    )
    await userEvent.click(publish)
    expect(publish).toHaveAttribute('aria-disabled', 'true')
    expect(posts(api)).toHaveLength(0)

    await click('Save draft')
    expect(await screen.findByText('Draft saved.')).toBeInTheDocument()
  })

  it.each([
    ['draft', /Available once your company is verified/],
    ['rejected', /was not approved/],
    ['suspended', /blocked while your company is suspended/],
  ] as const)('says why for a %s company', async (status, reason) => {
    renderForm(vacancyRoutes(status))
    await field('Job title')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).toHaveAccessibleDescription(reason),
    )
  })

  it('names every missing field in red when the vacancy is not ready, and sends nothing', async () => {
    const { api } = renderForm(vacancyRoutes())
    await userEvent.type(await field('Job title'), 'Driver')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).not.toHaveAttribute('aria-disabled'),
    )

    await click('Publish')

    await waitFor(() =>
      expect(screen.getByLabelText('Job type')).toHaveAccessibleDescription(
        'Choose the type of job',
      ),
    )
    expect(screen.getByLabelText('District')).toHaveAccessibleDescription(/Choose a district/)
    expect(screen.getByLabelText('About the job')).toHaveAccessibleDescription('Describe the job')
    expect(screen.getByLabelText('Applications close on')).toHaveAccessibleDescription(
      /Choose when applications close/,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Complete the fields marked in red before you publish',
    )
    expect(posts(api)).toHaveLength(0)
  })

  it('a remote vacancy needs no district to publish', async () => {
    const { api } = renderForm({
      ...vacancyRoutes(),
      [CREATE]: () => okData(savedDraft, 201),
      'POST /api/v1/employer/vacancies/v1/publish': () =>
        okData({ ...savedDraft, status: 'published', is_live: true }),
    })
    await userEvent.type(await field('Job title'), 'Remote analyst')
    await userEvent.selectOptions(screen.getByLabelText('Job type'), 'Contract')
    await userEvent.click(screen.getByRole('radio', { name: 'Remote' }))
    await userEvent.type(screen.getByLabelText('About the job'), 'Work from home.')
    fireEvent.change(screen.getByLabelText('Applications close on'), { target: { value: soon() } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).not.toHaveAttribute('aria-disabled'),
    )

    await click('Publish')

    expect(await screen.findByText('Vacancy published.')).toBeInTheDocument()
    expect(body(posts(api)[0])).toMatchObject({ work_arrangement: 'remote', district_id: null })
  })

  it('saves, publishes and returns to the list when everything is ready', async () => {
    const { api, router } = renderForm({
      ...vacancyRoutes(),
      [CREATE]: () => okData(savedDraft, 201),
      'POST /api/v1/employer/vacancies/v1/publish': () =>
        okData({ ...savedDraft, status: 'published', is_live: true }),
    })
    await fillComplete()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).not.toHaveAttribute('aria-disabled'),
    )

    await click('Publish')

    expect(await screen.findByText('Vacancy published.')).toBeInTheDocument()
    expect(body(posts(api)[0])).toMatchObject({
      title: 'Accounts Assistant',
      employment_type: 'full_time',
      work_arrangement: 'onsite',
      district_id: KAMPALA,
      description: 'Prepare invoices.',
      expires_at: `${soon()}T23:59:00+03:00`,
    })
    expect(api.callsTo('POST', '/api/v1/employer/vacancies/v1/publish')).toHaveLength(1)
    await waitFor(() => expect(router.state.location.pathname).toBe('/employer'))
  })

  it('keeps the saved draft and shows the server reason if publishing is refused', async () => {
    const { router } = renderForm({
      ...vacancyRoutes(),
      [CREATE]: () => okData(savedDraft, 201),
      'GET /api/v1/employer/vacancies/v1': () => okData(savedDraft),
      'POST /api/v1/employer/vacancies/v1/publish': () =>
        apiError(
          403,
          'employer_not_verified',
          'Your company must be verified before you can publish.',
        ),
    })
    await fillComplete()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).not.toHaveAttribute('aria-disabled'),
    )

    await click('Publish')

    await waitFor(() => expect(router.state.location.pathname).toBe('/employer/vacancies/v1'))
    // The page was replaced by the saved draft's own page: the reason must still be there.
    expect(await screen.findByRole('alert')).toHaveTextContent('Your company must be verified')
  })
})

describe('editing', () => {
  const draftToEdit = makeManaged({
    id: 'v1',
    title: 'Cook',
    description: 'Prepare meals.',
    district_id: KAMPALA,
    salary_min: 500000,
    salary_max: 700000,
    show_salary: true,
    requirements: [
      { id: 'r1', kind: 'skill', skill_id: 'sk2', label: 'Python', is_mandatory: true },
      { id: 'r2', kind: 'other', skill_id: null, label: 'Own motorbike', is_mandatory: false },
    ],
  })

  it('fills the form from the saved vacancy, and saves changes with PUT', async () => {
    const { api } = renderForm(
      {
        ...vacancyRoutes(),
        'GET /api/v1/employer/vacancies/v1': () => okData(draftToEdit),
        'PUT /api/v1/employer/vacancies/v1': (request: { body: unknown }) =>
          okData({ ...draftToEdit, ...(request.body as object) }),
      },
      '/employer/vacancies/v1',
    )

    const title = await field('Job title')
    expect(title).toHaveValue('Cook')
    expect(screen.getByLabelText('Lowest pay (UGX)')).toHaveValue('500000')
    expect(screen.getByLabelText('Show the pay on the vacancy')).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Python: required' })).toBeChecked()
    expect(screen.getByLabelText('Requirement')).toHaveValue('Own motorbike')
    await userEvent.clear(title)
    await userEvent.type(title, 'Head cook')
    await click('Save draft')

    expect(await screen.findByText('Draft saved.')).toBeInTheDocument()
    const put = api.callsTo('PUT', '/api/v1/employer/vacancies/v1')
    expect(put).toHaveLength(1)
    expect(body(put[0])).toMatchObject({ title: 'Head cook', salary_min: 500000 })
  })

  it('discards a draft after confirming', async () => {
    const { api, router } = renderForm(
      {
        ...vacancyRoutes(),
        'GET /api/v1/employer/vacancies/v1': () => okData(draftToEdit),
        'POST /api/v1/employer/vacancies/v1/close': () =>
          okData({ ...draftToEdit, status: 'closed' }),
      },
      '/employer/vacancies/v1',
    )
    await field('Job title')

    await click('Discard draft…')
    const dialog = await screen.findByRole('dialog', { name: 'Discard this draft?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard draft' }))

    expect(await screen.findByText('Draft discarded.')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/employer/vacancies/v1/close')).toHaveLength(1)
    await waitFor(() => expect(router.state.location.pathname).toBe('/employer'))
  })

  const published = makeManaged({
    id: 'v1',
    title: 'Cook',
    status: 'published',
    is_live: true,
    published_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    district_id: KAMPALA,
  })

  it('locks the title, type, place and how to apply of a live vacancy, and says so', async () => {
    renderForm(
      { ...vacancyRoutes(), 'GET /api/v1/employer/vacancies/v1': () => okData(published) },
      '/employer/vacancies/v1',
    )

    expect(await field('Job title')).toBeDisabled()
    expect(screen.getByLabelText('Job type')).toBeDisabled()
    expect(screen.getByLabelText('District')).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'On-site' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'On this site (recommended)' })).toBeDisabled()
    expect(
      screen.getByText(/The title, job type, place and how people apply cannot be changed/),
    ).toBeVisible()
    expect(screen.getByLabelText('About the job')).toBeEnabled()
    expect(screen.getByLabelText('Applications close on')).toBeEnabled()
    expect(screen.getByLabelText('Lowest pay (UGX)')).toBeEnabled()
    expect(screen.getByText('Live')).toBeVisible()
  })

  it('has no Publish button on a live vacancy, but saves changes', async () => {
    const { api } = renderForm(
      {
        ...vacancyRoutes(),
        'GET /api/v1/employer/vacancies/v1': () => okData(published),
        'PUT /api/v1/employer/vacancies/v1': () => okData(published),
      },
      '/employer/vacancies/v1',
    )
    await userEvent.type(await field('About the job'), ' More.')
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()

    await click('Save changes')

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
    expect(api.callsTo('PUT', '/api/v1/employer/vacancies/v1')).toHaveLength(1)
  })

  it('the closing date limit counts from when it was published', async () => {
    renderForm(
      { ...vacancyRoutes(), 'GET /api/v1/employer/vacancies/v1': () => okData(published) },
      '/employer/vacancies/v1',
    )

    expect(await field('Applications close on')).toHaveAttribute(
      'max',
      addDays(dayInKampala(published.published_at as string), 89),
    )
  })

  it('closes a live vacancy only after confirming', async () => {
    const { api, router } = renderForm(
      {
        ...vacancyRoutes(),
        'GET /api/v1/employer/vacancies/v1': () => okData(published),
        'POST /api/v1/employer/vacancies/v1/close': () =>
          okData({ ...published, status: 'closed', is_live: false }),
      },
      '/employer/vacancies/v1',
    )
    await field('Job title')

    await click('Close vacancy…')
    const dialog = await screen.findByRole('dialog', { name: 'Close “Cook”?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it open' }))
    expect(api.callsTo('POST', '/api/v1/employer/vacancies/v1/close')).toHaveLength(0)
    await click('Close vacancy…')
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Close “Cook”?' })).getByRole('button', {
        name: 'Close vacancy',
      }),
    )

    expect(await screen.findByText('Vacancy closed.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/employer'))
  })

  it('shows a closed vacancy as read-only', async () => {
    renderForm(
      {
        ...vacancyRoutes(),
        'GET /api/v1/employer/vacancies/v1': () =>
          okData({ ...published, status: 'closed', is_live: false }),
      },
      '/employer/vacancies/v1',
    )

    expect(
      await screen.findByText(/This vacancy is closed\. It cannot be changed or reopened\./),
    ).toBeVisible()
    expect(screen.queryByLabelText('Job title')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument()
  })

  it('says so for a vacancy that is not theirs or does not exist (404)', async () => {
    renderForm(
      {
        ...vacancyRoutes(),
        'GET /api/v1/employer/vacancies/v1': () =>
          apiError(404, 'vacancy_not_found', 'This vacancy does not exist.'),
      },
      '/employer/vacancies/v1',
    )

    expect(await screen.findByRole('heading', { name: 'Vacancy not found' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to your vacancies' })).toHaveAttribute(
      'href',
      '/employer',
    )
  })

  it('shows an error with Retry if the vacancy cannot be loaded', async () => {
    let fail = true
    renderForm(
      {
        ...vacancyRoutes(),
        'GET /api/v1/employer/vacancies/v1': () =>
          fail ? apiError(500, 'internal_error', 'Server error') : okData(draftToEdit),
      },
      '/employer/vacancies/v1',
    )

    expect(await screen.findByText('Could not load this vacancy')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await field('Job title')).toHaveValue('Cook')
  })
})
