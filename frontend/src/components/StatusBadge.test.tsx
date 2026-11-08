import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from '../lib/applicationStatus'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it.each(APPLICATION_STATUSES)('shows a text label for %s (never colour alone)', (status) => {
    render(<StatusBadge status={status} />)

    expect(screen.getByText(APPLICATION_STATUS_LABELS[status])).toBeVisible()
  })

  it('labels rejected applications "Not selected" for applicants', () => {
    render(<StatusBadge status="rejected" />)

    expect(screen.getByText('Not selected')).toBeInTheDocument()
  })
})
