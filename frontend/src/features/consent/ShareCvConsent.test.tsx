import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Consent } from '../../api/types'
import { apiError, loggedIn, makeUser, mockApi, okData, renderWithAuth } from '../../test/utils'
import { ShareCvConsent } from './ShareCvConsent'

const GET = 'GET /api/v1/consents/me'
const POST = 'POST /api/v1/consents'

const base: Consent[] = [
  { consent_type: 'terms', policy_version: 'v1', granted_at: '2026-11-05T09:00:00Z' },
  { consent_type: 'privacy', policy_version: 'v1', granted_at: '2026-11-05T09:00:00Z' },
]
const sharing: Consent = {
  consent_type: 'cv_sharing_with_employers',
  policy_version: 'v1',
  granted_at: '2026-11-06T09:00:00Z',
}

const box = () =>
  screen.findByRole('checkbox', { name: 'Employers I apply to may see my profile and CV' })

describe('ShareCvConsent', () => {
  it('shows a status while loading', () => {
    mockApi({ ...loggedIn(makeUser()), [GET]: () => okData(base) })
    renderWithAuth(<ShareCvConsent />)

    expect(screen.getByText('Loading your choice')).toBeInTheDocument()
  })

  it('is unticked until the user opts in', async () => {
    mockApi({ ...loggedIn(makeUser()), [GET]: () => okData(base) })
    renderWithAuth(<ShareCvConsent />)

    expect(await box()).not.toBeChecked()
    expect(screen.getByText(/Needed before you can apply/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })

  it('is ticked when the consent is already given', async () => {
    mockApi({ ...loggedIn(makeUser()), [GET]: () => okData([...base, sharing]) })
    renderWithAuth(<ShareCvConsent />)

    expect(await box()).toBeChecked()
  })

  it('records the consent when ticked and withdraws it when unticked', async () => {
    const api = mockApi({
      ...loggedIn(makeUser()),
      [GET]: () => okData(base),
      [POST]: (request) =>
        okData((request.body as { granted: boolean }).granted ? [...base, sharing] : base),
    })
    renderWithAuth(<ShareCvConsent />)

    await userEvent.click(await box())
    expect(await screen.findByRole('checkbox', { checked: true })).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/consents')[0].body).toEqual({
      consent_type: 'cv_sharing_with_employers',
      granted: true,
    })

    await userEvent.click(screen.getByRole('checkbox'))
    expect(await screen.findByRole('checkbox', { checked: false })).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/v1/consents')[1].body).toEqual({
      consent_type: 'cv_sharing_with_employers',
      granted: false,
    })
  })

  it('shows the server message and stays unticked when saving fails', async () => {
    mockApi({
      ...loggedIn(makeUser()),
      [GET]: () => okData(base),
      [POST]: () => apiError(500, 'internal_error', 'Something went wrong on our side.'),
    })
    renderWithAuth(<ShareCvConsent />)

    await userEvent.click(await box())

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(await box()).not.toBeChecked()
  })

  it('shows an error with Retry if the choice cannot be loaded', async () => {
    let fail = true
    mockApi({
      ...loggedIn(makeUser()),
      [GET]: () => (fail ? apiError(500, 'internal_error', 'Server error') : okData(base)),
    })
    renderWithAuth(<ShareCvConsent />)

    expect(await screen.findByText('Could not load your choice')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await box()).toBeInTheDocument()
  })
})
