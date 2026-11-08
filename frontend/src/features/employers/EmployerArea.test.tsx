import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { VerificationStatus } from '../../api/types'
import { apiError, mockApi, okData, renderRoutes } from '../../test/utils'
import { EmployerLayout } from './EmployerLayout'
import { PublishButton } from './PublishButton'
import { EMPLOYER_PATH, employerRoutes, makeEmployer } from './testData'

function renderArea(route: string, routes: Record<string, unknown>) {
  const api = mockApi(routes as Parameters<typeof mockApi>[0])
  const view = renderRoutes(
    [
      {
        element: <EmployerLayout />,
        children: [
          { path: '/employer', element: <p>Dashboard</p> },
          {
            path: '/employer/profile',
            element: (
              <>
                <h1>Company profile page</h1>
                <PublishButton>Publish now</PublishButton>
              </>
            ),
          },
        ],
      },
    ],
    { route },
  )
  return { api, ...view }
}

const banner = () => screen.findByTestId('verification-banner')

describe('verification banner', () => {
  it('asks a new employer to set up the company profile', async () => {
    renderArea('/employer', employerRoutes(null))

    const element = await banner()

    expect(element).toHaveTextContent('Your company is not verified yet')
    expect(element).toHaveAttribute('role', 'status')
    expect(within(element).getByRole('link', { name: 'Set up company profile' })).toHaveAttribute(
      'href',
      '/employer/profile',
    )
  })

  it('asks a draft employer to complete the profile', async () => {
    renderArea('/employer', employerRoutes(makeEmployer()))

    expect(await banner()).toHaveTextContent('Your company is not verified yet')
    expect(screen.getByRole('link', { name: 'Complete company profile' })).toBeInTheDocument()
  })

  it('says a pending company is being checked, with the date it was sent', async () => {
    renderArea(
      '/employer',
      employerRoutes(
        makeEmployer({ verification_status: 'pending', submitted_at: '2026-11-06T06:12:00Z' }),
      ),
    )

    const element = await banner()

    expect(element).toHaveTextContent('We are checking your company')
    expect(element).toHaveTextContent('You sent your profile on 6 Nov 2026')
    expect(element).toHaveTextContent('cannot edit it or post vacancies')
    expect(element).toHaveAttribute('role', 'status')
  })

  it('tells an approved company it can post vacancies', async () => {
    renderArea(
      '/employer',
      employerRoutes(makeEmployer({ verification_status: 'approved', can_publish: true })),
    )

    const element = await banner()

    expect(element).toHaveTextContent('Your company is verified')
    expect(element).toHaveTextContent('You can post vacancies.')
  })

  it('shows the admin reason on a rejected company, as an alert with a way to fix it', async () => {
    renderArea(
      '/employer',
      employerRoutes(
        makeEmployer({
          verification_status: 'rejected',
          status_reason: 'We could not find this registration number.',
        }),
      ),
    )

    const element = await banner()

    expect(element).toHaveAttribute('role', 'alert')
    expect(element).toHaveTextContent('Your company was not approved')
    expect(element).toHaveTextContent('We could not find this registration number.')
    expect(screen.getByRole('link', { name: 'Edit and send again' })).toHaveAttribute(
      'href',
      '/employer/profile',
    )
  })

  it('shows the reason on a suspended company and says live vacancies stay', async () => {
    renderArea(
      '/employer',
      employerRoutes(
        makeEmployer({ verification_status: 'suspended', status_reason: 'Unpaid training fees.' }),
      ),
    )

    const element = await banner()

    expect(element).toHaveAttribute('role', 'alert')
    expect(element).toHaveTextContent('Your company is suspended')
    expect(element).toHaveTextContent('Unpaid training fees.')
    expect(element).toHaveTextContent('already live stay as they are')
  })

  it('shows an error with Retry if the status cannot be loaded', async () => {
    let fail = true
    renderArea('/employer', {
      ...employerRoutes(makeEmployer({ verification_status: 'approved', can_publish: true })),
      [EMPLOYER_PATH]: () =>
        fail
          ? apiError(500, 'internal_error', 'Server error')
          : okData(makeEmployer({ verification_status: 'approved', can_publish: true })),
    })

    expect(await screen.findByText('Could not check your company status')).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Your company is verified')).toBeInTheDocument()
  })

  it('stays above every employer page', async () => {
    renderArea(
      '/employer/profile',
      employerRoutes(makeEmployer({ verification_status: 'pending' })),
    )

    expect(await screen.findByRole('heading', { name: 'Company profile page' })).toBeInTheDocument()
    expect(await banner()).toHaveTextContent('We are checking your company')
  })
})

describe('publish button', () => {
  const blocked: [VerificationStatus, RegExp][] = [
    ['draft', /Available once your company is verified/],
    ['pending', /Available once we have finished checking/],
    ['rejected', /was not approved/],
    ['suspended', /blocked while your company is suspended/],
  ]

  it.each(blocked)(
    'is disabled with an explanation when the company is %s',
    async (status, text) => {
      renderArea('/employer/profile', employerRoutes(makeEmployer({ verification_status: status })))

      const button = await screen.findByRole('button', { name: 'Publish now' })

      await waitFor(() => expect(button).toHaveAccessibleDescription(text))
      expect(button).toHaveAttribute('aria-disabled', 'true')
    },
  )

  it('does nothing when clicked while blocked', async () => {
    let clicks = 0
    mockApi(employerRoutes(makeEmployer()) as Parameters<typeof mockApi>[0])
    renderRoutes(
      [
        {
          element: <EmployerLayout />,
          children: [
            {
              path: '/employer/profile',
              element: <PublishButton onClick={() => clicks++}>Publish now</PublishButton>,
            },
          ],
        },
      ],
      { route: '/employer/profile' },
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Publish now' }))

    expect(clicks).toBe(0)
  })

  it('explains when there is no company profile yet, with a link to make one', async () => {
    renderArea('/employer/profile', employerRoutes(null))

    const button = await screen.findByRole('button', { name: 'Publish now' })

    await waitFor(() =>
      expect(button).toHaveAccessibleDescription(/Available once your company is verified/),
    )
    expect(screen.getAllByRole('link', { name: 'Go to company profile' })[0]).toHaveAttribute(
      'href',
      '/employer/profile',
    )
  })

  it('is enabled and works when the company is approved', async () => {
    let clicks = 0
    mockApi(
      employerRoutes(
        makeEmployer({ verification_status: 'approved', can_publish: true }),
      ) as Parameters<typeof mockApi>[0],
    )
    renderRoutes(
      [
        {
          element: <EmployerLayout />,
          children: [
            {
              path: '/employer/profile',
              element: <PublishButton onClick={() => clicks++}>Publish now</PublishButton>,
            },
          ],
        },
      ],
      { route: '/employer/profile' },
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish now' })).not.toHaveAttribute(
        'aria-disabled',
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Publish now' }))

    expect(clicks).toBe(1)
  })

  it('becomes a link when given a destination and approved', async () => {
    mockApi(
      employerRoutes(
        makeEmployer({ verification_status: 'approved', can_publish: true }),
      ) as Parameters<typeof mockApi>[0],
    )
    renderRoutes(
      [
        {
          element: <EmployerLayout />,
          children: [
            {
              path: '/employer/profile',
              element: <PublishButton to="/somewhere">Go</PublishButton>,
            },
          ],
        },
      ],
      { route: '/employer/profile' },
    )

    expect(await screen.findByRole('link', { name: 'Go' })).toHaveAttribute('href', '/somewhere')
  })
})
