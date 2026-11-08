import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  it('announces the error and calls onRetry', async () => {
    const onRetry = vi.fn()
    render(<ErrorState message="Could not load vacancies." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load vacancies.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('blocks Retry while a retry is running', async () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} retrying />)

    const button = screen.getByRole('button', { name: /retrying/i })
    expect(button).toBeDisabled()
    await userEvent.click(button)

    expect(onRetry).not.toHaveBeenCalled()
  })
})
