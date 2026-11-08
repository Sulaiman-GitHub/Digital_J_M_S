import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { apiError, loggedIn, makeUser, mockApi, renderWithAuth } from '../../test/utils'
import { makeProfile, profileRoutes } from '../profile/testData'
import { AccountPage } from './AccountPage'

describe('AccountPage', () => {
  it('shows the account details of the logged-in user', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'employer', email_verified: false })) })
    renderWithAuth(<AccountPage />)

    expect(await screen.findByRole('heading', { name: 'My account' })).toBeInTheDocument()
    expect(screen.getByText('nakato@example.com')).toBeInTheDocument()
    expect(screen.getByText('Employer')).toBeInTheDocument()
    expect(screen.getByText('Not verified')).toBeInTheDocument()
    expect(screen.getByText('5 Nov 2026')).toBeInTheDocument()
  })

  it('shows Verified for a verified email', async () => {
    mockApi({ ...loggedIn(makeUser({ email_verified: true })) })
    renderWithAuth(<AccountPage />)

    expect(await screen.findByText('Verified')).toBeInTheDocument()
  })
})

describe('AccountPage profile prompt', () => {
  it('invites a job seeker without a profile to create one', async () => {
    mockApi({ ...profileRoutes(null) })
    renderWithAuth(<AccountPage />)

    expect(
      await screen.findByRole('heading', { name: 'Complete your profile' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start my profile' })).toHaveAttribute(
      'href',
      '/profile',
    )
  })

  it('shows how complete the profile is', async () => {
    mockApi({ ...profileRoutes(makeProfile()) }) // saved, no skills yet: 40%
    renderWithAuth(<AccountPage />)

    expect(
      await screen.findByRole('heading', { name: 'Your profile is 40% complete' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit my profile' })).toHaveAttribute(
      'href',
      '/profile',
    )
  })

  it('says when the profile is complete', async () => {
    const complete = makeProfile({
      summary: 'Hello',
      skills: [{ id: 's', name: 'Python' }],
      experiences: [
        {
          id: 'e',
          title: 'T',
          organisation: 'O',
          start_date: '2024-01-01',
          end_date: null,
          description: null,
        },
      ],
    })
    mockApi({ ...profileRoutes(complete) })
    renderWithAuth(<AccountPage />)

    expect(
      await screen.findByRole('heading', { name: 'Your profile is complete' }),
    ).toBeInTheDocument()
  })

  it('does not show the prompt, or ask for a profile, for employers', async () => {
    const api = mockApi({ ...profileRoutes(null), ...loggedIn(makeUser({ role: 'employer' })) })
    renderWithAuth(<AccountPage />)

    await screen.findByRole('heading', { name: 'My account' })

    expect(screen.queryByText('Complete your profile')).not.toBeInTheDocument()
    expect(api.callsTo('GET', '/api/v1/profile/me')).toHaveLength(0)
  })

  it('shows nothing about the profile while loading or when it fails to load', async () => {
    mockApi({
      ...profileRoutes(null),
      'GET /api/v1/profile/me': () => apiError(500, 'internal_error', 'Down.'),
    })
    renderWithAuth(<AccountPage />)

    await screen.findByRole('heading', { name: 'My account' })

    expect(screen.queryByText('Complete your profile')).not.toBeInTheDocument()
  })
})
