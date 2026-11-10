import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { setTheme } from '../lib/theme'

afterEach(() => {
  act(() => setTheme('light'))
  localStorage.clear()
})

describe('ThemeToggle', () => {
  it('starts light and switches the page to dark and back', async () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Dark mode' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(button)

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('djm-theme')).toBe('dark')

    await userEvent.click(button)

    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('still works when the browser will not store the choice', async () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
    try {
      render(<ThemeToggle />)
      await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }))
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    } finally {
      Storage.prototype.setItem = original
    }
  })
})
