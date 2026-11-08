import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('links the label to the input', async () => {
    render(<TextField label="Email" />)

    const input = screen.getByLabelText('Email')
    await userEvent.type(input, 'a@b.ug')

    expect(input).toHaveValue('a@b.ug')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('shows the error, marks the input invalid and describes it with hint and error', () => {
    render(<TextField label="Email" hint="We never share it" error="Enter a valid email" />)

    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // The "!" icon is aria-hidden, so it is not part of the description.
    expect(input).toHaveAccessibleDescription('We never share it Enter a valid email')
    expect(screen.getByText('Enter a valid email')).toBeVisible()
  })

  it('uses a given id', () => {
    render(<TextField label="Phone" id="phone" />)

    expect(screen.getByLabelText('Phone')).toHaveAttribute('id', 'phone')
  })
})
