import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { loggedOut, mockApi, renderWithAuth } from '../../test/utils'
import { PrivacyPage } from './PrivacyPage'
import { TermsPage } from './TermsPage'

function renderAt(route: string) {
  mockApi({ ...loggedOut })
  return renderWithAuth(
    <Routes>
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
    </Routes>,
    { route },
  )
}

describe('legal pages', () => {
  it('shows the Terms with the review notice, without needing to log in', () => {
    renderAt('/terms')

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeInTheDocument()
    expect(screen.getByText(/to be reviewed by a lawyer/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })

  it('shows the Privacy Policy with the review notice', () => {
    renderAt('/privacy')

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/to be reviewed by a lawyer/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Who can see it' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms')
  })
})
