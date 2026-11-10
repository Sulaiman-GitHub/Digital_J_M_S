import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JOB_SITES } from './jobSites'
import { OtherJobSites } from './OtherJobSites'

describe('OtherJobSites', () => {
  it('links to a search for the same words on each site, in a new tab', () => {
    render(<OtherJobSites words="Accounts Assistant" />)

    const linkedin = screen.getByRole('link', { name: /LinkedIn/ })
    expect(linkedin).toHaveAttribute('target', '_blank')
    expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer')
    expect(linkedin.getAttribute('href')).toContain('keywords=Accounts%20Assistant')
    expect(linkedin.getAttribute('href')).toContain('location=Uganda')
    expect(screen.getAllByRole('link')).toHaveLength(JOB_SITES.length)
  })

  it('escapes what the search contains', () => {
    render(<OtherJobSites words={'a&b=c <script>'} />)

    for (const link of screen.getAllByRole('link')) {
      const href = link.getAttribute('href') ?? ''
      expect(href).not.toContain('<script>')
      expect(href).not.toContain('a&b=c')
    }
  })

  it('searches for "graduate" when there are no words, and can take its own heading', () => {
    render(<OtherJobSites words="   " heading="Not finding it?" />)

    expect(screen.getByRole('heading', { name: 'Not finding it?' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Indeed/ }).getAttribute('href')).toContain(
      'q=graduate',
    )
  })
})
