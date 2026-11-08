import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Consent, Cv, Profile } from '../../api/types'
import {
  apiError,
  jsonResponse,
  loggedIn,
  makeUser,
  mockApi,
  okData,
  renderRoutes,
} from '../../test/utils'
import { makeProfile } from '../profile/testData'
import { makeDetail } from '../vacancies/testData'
import { ApplyPage } from './ApplyPage'
import { makeApplication, makeItem } from './testData'

type Routes = Parameters<typeof mockApi>[0]

const CV: Cv = {
  id: 'cv-1',
  original_filename: 'nakato-cv.pdf',
  content_type: 'application/pdf',
  size_bytes: 245_760,
  created_at: '2026-11-05T09:00:00Z',
}
const SHARING: Consent = {
  consent_type: 'cv_sharing_with_employers',
  policy_version: '2026-11',
  granted_at: '2026-11-05T09:00:00Z',
}
const APPLY = 'POST /api/v1/vacancies/v1/applications'
const CONSENT = 'POST /api/v1/consents'

interface Setup {
  verified?: boolean
  profile?: Profile | null
  cv?: Cv | null
  consents?: Consent[]
  existing?: ReturnType<typeof makeItem> | null
  vacancy?: ReturnType<typeof makeDetail>
  routes?: Record<string, unknown>
}

function renderApply({
  verified = true,
  profile = makeProfile({ skills: [{ id: 's1', name: 'Excel' }] }),
  cv = CV,
  consents = [SHARING],
  existing = null,
  vacancy = makeDetail(),
  routes = {},
}: Setup = {}) {
  const api = mockApi({
    ...loggedIn(makeUser({ role: 'job_seeker', email_verified: verified })),
    'GET /api/v1/vacancies/v1': () => okData(vacancy),
    'GET /api/v1/applications/me*': () =>
      jsonResponse({
        data: existing ? [existing] : [],
        meta: { page: 1, page_size: 1, total: existing ? 1 : 0 },
      }),
    'GET /api/v1/profile/me': () =>
      profile ? okData(profile) : apiError(404, 'profile_not_found', 'No profile.'),
    'GET /api/v1/cv/me': () => (cv ? okData(cv) : apiError(404, 'cv_not_found', 'No CV.')),
    'GET /api/v1/consents/me': () => okData(consents),
    [APPLY]: () => okData(makeApplication({ id: 'a9' }), 201),
    [CONSENT]: () => okData([SHARING]),
    ...routes,
  } as Routes)
  const view = renderRoutes(
    [
      { path: '/jobs/:id/apply', element: <ApplyPage /> },
      { path: '/jobs/:id', element: <p>The vacancy</p> },
      { path: '/applications/:id', element: <p>Application page</p> },
    ],
    { route: '/jobs/v1/apply' },
  )
  return { api, ...view }
}

const sendButton = () => screen.findByRole('button', { name: 'Send application' })

describe('what is shown', () => {
  it('shows what will be sent when everything is ready', async () => {
    renderApply()

    expect(await screen.findByRole('heading', { name: 'What will be sent' })).toBeVisible()
    expect(screen.getByText(/Nakato Sarah · 1 skill · 0 experiences/)).toBeVisible()
    expect(screen.getByText(/nakato-cv\.pdf \(240 KB\)/)).toBeVisible()
    expect(screen.getByText(/nakato@example\.com, so the employer can reply/)).toBeVisible()
    expect(await sendButton()).not.toHaveAttribute('aria-disabled')
  })

  it('shows a status while loading', () => {
    renderApply()

    expect(screen.getByText('Loading')).toBeInTheDocument()
  })

  it('shows Retry when something cannot be loaded, and recovers', async () => {
    let fail = true
    renderApply({
      routes: {
        'GET /api/v1/consents/me': () =>
          fail ? apiError(500, 'server_error', 'Oops') : okData([SHARING]),
      },
    })

    expect(await screen.findByText('Could not load this page')).toBeVisible()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'What will be sent' })).toBeVisible()
  })

  it('says so when the vacancy is gone', async () => {
    renderApply({
      routes: {
        'GET /api/v1/vacancies/v1': () => apiError(404, 'vacancy_not_found', 'Gone.'),
      },
    })

    expect(
      await screen.findByRole('heading', { name: 'This vacancy is no longer available' }),
    ).toBeVisible()
  })

  it('explains that an external vacancy is applied for elsewhere', async () => {
    renderApply({
      vacancy: makeDetail({
        application_method: 'external',
        external_url: 'https://jobs.example.com/1',
      }),
    })

    expect(await screen.findByText(/takes applications on its own website/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Send application' })).not.toBeInTheDocument()
  })

  it('points to the application when the person has already applied', async () => {
    renderApply({ existing: makeItem({ id: 'a5' }) })

    const link = await screen.findByRole('link', { name: 'See your application' })

    expect(link).toHaveAttribute('href', '/applications/a5')
    expect(screen.queryByRole('button', { name: 'Send application' })).not.toBeInTheDocument()
  })
})

describe('missing preconditions', () => {
  it('links to the profile when there is none, and does not send', async () => {
    const { api } = renderApply({ profile: null })

    const link = await screen.findByRole('link', { name: 'Complete your profile' })
    const button = await sendButton()
    await userEvent.click(button)

    expect(link).toHaveAttribute('href', '/profile')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription('Finish the steps above to apply.')
    expect(api.callsTo('POST', '/api/v1/vacancies/v1/applications')).toHaveLength(0)
  })

  it('links to the CV upload when there is no CV', async () => {
    renderApply({ cv: null })

    expect(await screen.findByRole('link', { name: 'Upload your CV' })).toHaveAttribute(
      'href',
      '/profile',
    )
    expect(await sendButton()).toHaveAttribute('aria-disabled', 'true')
  })

  it('asks an unverified person to confirm their email first', async () => {
    const { api } = renderApply({ verified: false })

    expect(await screen.findByText(/Confirm your email address first/)).toBeVisible()
    const button = await sendButton()
    await userEvent.click(button)

    expect(button).toHaveAccessibleDescription('Confirm your email address to apply.')
    expect(api.callsTo('POST', '/api/v1/vacancies/v1/applications')).toHaveLength(0)
  })

  it('needs the sharing box ticked when the consent was never given', async () => {
    const { api } = renderApply({ consents: [] })
    const button = await sendButton()

    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(api.callsTo('POST', '/api/v1/vacancies/v1/applications')).toHaveLength(0)

    await userEvent.click(screen.getByRole('checkbox', { name: /may see my profile and CV/ }))
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  })

  it('hides the sharing box when the consent is already given', async () => {
    renderApply()
    await sendButton()

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

describe('sending', () => {
  it('sends the cover note and shows the success screen', async () => {
    const { api } = renderApply()
    await userEvent.type(await screen.findByLabelText('Cover note (optional)'), '  Hello  ')

    await userEvent.click(await sendButton())

    expect(await screen.findByRole('heading', { name: 'Application sent' })).toBeVisible()
    expect(api.callsTo('POST', '/api/v1/vacancies/v1/applications')[0].body).toEqual({
      cover_note: 'Hello',
    })
    expect(screen.getByRole('link', { name: 'See my application' })).toHaveAttribute(
      'href',
      '/applications/a9',
    )
    expect(api.callsTo('POST', '/api/v1/consents')).toHaveLength(0)
  })

  it('sends null when the note is left empty', async () => {
    const { api } = renderApply()

    await userEvent.click(await sendButton())

    await screen.findByRole('heading', { name: 'Application sent' })
    expect(api.callsTo('POST', '/api/v1/vacancies/v1/applications')[0].body).toEqual({
      cover_note: null,
    })
  })

  it('records the consent first when it was not given', async () => {
    const { api } = renderApply({ consents: [] })
    await userEvent.click(await screen.findByRole('checkbox', { name: /may see my profile/ }))

    await userEvent.click(await sendButton())

    await screen.findByRole('heading', { name: 'Application sent' })
    expect(api.callsTo('POST', '/api/v1/consents')[0].body).toEqual({
      consent_type: 'cv_sharing_with_employers',
      granted: true,
    })
  })

  it('refuses a cover note that is too long, without sending', async () => {
    const { api } = renderApply()
    const note = await screen.findByLabelText('Cover note (optional)')
    await userEvent.click(note)
    await userEvent.paste('x'.repeat(2001))

    await userEvent.click(await sendButton())

    expect(await screen.findByText('Use at most 2000 characters')).toBeVisible()
    expect(api.callsTo('POST', '/api/v1/vacancies/v1/applications')).toHaveLength(0)
  })

  it('shows the existing application when the server says already applied', async () => {
    let applied = false
    renderApply({
      routes: {
        [APPLY]: () => {
          applied = true
          return apiError(409, 'already_applied', 'You have already applied for this vacancy.')
        },
        'GET /api/v1/applications/me*': () =>
          jsonResponse({
            data: applied ? [makeItem({ id: 'a5' })] : [],
            meta: { page: 1, page_size: 1, total: applied ? 1 : 0 },
          }),
      },
    })

    await userEvent.click(await sendButton())

    expect(await screen.findByText(/You have already applied for this vacancy/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'See your application' })).toHaveAttribute(
      'href',
      '/applications/a5',
    )
  })

  it('keeps the form and shows the problem when sending fails', async () => {
    renderApply({
      routes: { [APPLY]: () => apiError(409, 'cv_required', 'Upload your CV before you apply.') },
    })
    await userEvent.type(await screen.findByLabelText('Cover note (optional)'), 'Hello')

    await userEvent.click(await sendButton())

    expect(await screen.findByText('Upload your CV first.')).toBeVisible()
    expect(screen.getByLabelText('Cover note (optional)')).toHaveValue('Hello')
    expect(await sendButton()).not.toHaveAttribute('aria-busy')
  })

  it('says to check the connection when the request cannot be made', async () => {
    renderApply({ routes: { [APPLY]: () => Promise.reject(new TypeError('Failed to fetch')) } })

    await userEvent.click(await sendButton())

    expect(await screen.findByRole('alert')).toBeVisible()
  })
})
