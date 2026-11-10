import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './Footer'
import { loggedIn, makeUser, mockApi, renderRoutes } from '../test/utils'

function renderFooter(routes: Record<string, unknown>) {
  mockApi(routes as never)
  return renderRoutes([{ path: '/', element: <Footer /> }], { route: '/' })
}

describe('Footer', () => {
  it('links to the legal pages and invites visitors to register', async () => {
    renderFooter({})

    expect(await screen.findByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Create a free account' })).toHaveAttribute(
      'href',
      '/register',
    )
    expect(screen.getByRole('link', { name: 'Register your company' })).toBeInTheDocument()
    expect(screen.getByText(/Made in Uganda/)).toBeInTheDocument()
  })

  it('shows job seekers their own pages', async () => {
    renderFooter(loggedIn(makeUser({ role: 'job_seeker' })))

    expect(await screen.findByRole('link', { name: 'My applications' })).toHaveAttribute(
      'href',
      '/applications',
    )
    expect(screen.queryByRole('link', { name: 'Create a free account' })).not.toBeInTheDocument()
  })

  it('shows employers their dashboard and admins the review queue', async () => {
    const employer = renderFooter(loggedIn(makeUser({ role: 'employer' })))
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/employer',
    )
    employer.unmount()

    renderFooter(loggedIn(makeUser({ role: 'admin' })))
    expect(await screen.findByRole('link', { name: 'Review employers' })).toHaveAttribute(
      'href',
      '/admin/employers',
    )
  })
})
