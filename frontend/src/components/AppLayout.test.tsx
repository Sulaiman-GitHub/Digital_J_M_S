import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { loggedIn, loggedOut, makeUser, mockApi, renderWithAuth } from '../test/utils'
import { AppLayout } from './AppLayout'

function renderLayout() {
  return renderWithAuth(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<p>Page content</p>} />
      </Route>
    </Routes>,
  )
}

// The header has its own "Main" nav (desktop links); the bottom nav is the one with Profile.
const bottomNav = () =>
  screen
    .queryAllByRole('navigation', { name: 'Main' })
    .find((nav) => nav.className.includes('md:hidden') && nav.className.includes('fixed'))

describe('AppLayout bottom navigation', () => {
  it('is shown to job seekers, and the page leaves room for it', async () => {
    mockApi({ ...loggedIn(makeUser({ role: 'job_seeker' })) })
    renderLayout()

    await screen.findByText('Page content')

    await screen.findAllByRole('link', { name: 'Profile' })
    const nav = bottomNav()
    expect(nav).toBeDefined()
    expect(screen.getByRole('main').className).toContain('pb-24')
  })

  it.each([
    ['an employer', loggedIn(makeUser({ role: 'employer' }))],
    ['an admin', loggedIn(makeUser({ role: 'admin' }))],
    ['a visitor', loggedOut],
  ])('is not shown to %s', async (_who, routes) => {
    mockApi({ ...routes })
    renderLayout()

    await screen.findByText('Page content')
    await screen.findByRole('banner')

    expect(bottomNav()).toBeUndefined()
    expect(screen.getByRole('main').className).not.toContain('pb-24')
  })
})
