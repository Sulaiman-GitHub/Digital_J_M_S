import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BottomNav } from './BottomNav'

function renderAt(route: string) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('links to Jobs, Saved, Applications, Profile and Account', () => {
    renderAt('/')

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs')
    expect(screen.getByRole('link', { name: 'Saved' })).toHaveAttribute('href', '/saved')
    expect(screen.getByRole('link', { name: 'Applications' })).toHaveAttribute(
      'href',
      '/applications',
    )
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile')
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
  })

  it.each([
    ['/jobs', 'Jobs'],
    ['/saved', 'Saved'],
    ['/profile', 'Profile'],
    ['/account', 'Account'],
  ])('marks the current page (%s -> %s)', (route, current) => {
    renderAt(route)

    expect(screen.getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getAllByRole('link').filter((link) => link.hasAttribute('aria-current')),
    ).toHaveLength(1)
  })

  it('does not mark Jobs as current on other pages', () => {
    renderAt('/profile')

    expect(screen.getByRole('link', { name: 'Jobs' })).not.toHaveAttribute('aria-current')
  })

  it('is hidden from md up (the header carries the links there)', () => {
    renderAt('/')

    expect(screen.getByRole('navigation', { name: 'Main' }).className).toContain('md:hidden')
  })
})
