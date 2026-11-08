import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

const steps = [
  { id: 'basics', label: 'Basics' },
  { id: 'education', label: 'Education' },
  { id: 'skills', label: 'Skills' },
] as const

function renderStepper(overrides: Partial<Parameters<typeof Stepper>[0]> = {}) {
  const onSelect = vi.fn()
  render(
    <Stepper
      steps={steps}
      currentId="education"
      completedIds={new Set(['basics'])}
      lockedIds={new Set(['skills'])}
      onSelect={onSelect}
      percent={40}
      label="Profile progress"
      {...overrides}
    />,
  )
  return onSelect
}

describe('Stepper', () => {
  it('says which step this is and how much is saved', () => {
    renderStepper()

    expect(screen.getByText('Step 2 of 3: Education')).toBeInTheDocument()
    expect(screen.getByText('40% saved')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('marks the current step and gives saved and locked steps readable names', () => {
    renderStepper()

    expect(screen.getByRole('button', { name: 'Education' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('button', { name: 'Basics, saved' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(
      screen.getByRole('button', { name: 'Skills, locked until you save the earlier steps' }),
    ).toBeDisabled()
  })

  it('opens a step that is reachable and ignores a locked one', async () => {
    const onSelect = renderStepper()

    await userEvent.click(screen.getByRole('button', { name: 'Basics, saved' }))
    await userEvent.click(screen.getByRole('button', { name: /Skills, locked/ }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('basics')
  })

  it('keeps a visible sliver of the bar at 0%', () => {
    renderStepper({ percent: 0 })

    expect(screen.getByText('0% saved')).toBeInTheDocument()
    expect(screen.getByRole('progressbar').firstElementChild).toHaveStyle({ width: '4%' })
  })

  it('shows every step as a numbered button', () => {
    renderStepper({ completedIds: new Set(), lockedIds: new Set() })

    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})
