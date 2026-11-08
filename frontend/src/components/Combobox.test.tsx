import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Combobox } from './Combobox'

const options = [
  { value: 'gulu', label: 'Gulu University' },
  { value: 'kyambogo', label: 'Kyambogo University' },
  { value: 'makerere', label: 'Makerere University' },
  { value: 'muni', label: 'Muni University' },
]

function Harness({
  initial = null,
  onChange,
}: {
  initial?: string | null
  onChange?: (v: string | null) => void
}) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <Combobox
      label="Institution"
      options={options}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

describe('Combobox', () => {
  it('selects an option with the arrow keys and Enter', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByRole('combobox', { name: 'Institution' })

    await userEvent.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')

    // Opened by click with nothing highlighted: the first ArrowDown highlights option 1.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    const active = input.getAttribute('aria-activedescendant')
    expect(active && document.getElementById(active)).toHaveTextContent('Kyambogo University')

    await userEvent.keyboard('{ArrowUp}{End}')
    const last = input.getAttribute('aria-activedescendant')
    expect(last && document.getElementById(last)).toHaveTextContent('Muni University')

    await userEvent.keyboard('{Home}{ArrowDown}{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenLastCalledWith('makerere')
    expect(input).toHaveValue('Makerere University')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('filters while typing and selects the first match with Enter', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByRole('combobox', { name: 'Institution' })

    await userEvent.type(input, 'mu')

    const shown = screen.getAllByRole('option').map((o) => o.textContent)
    expect(shown).toEqual(['Muni University'])

    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('muni')
  })

  it('shows a message when nothing matches', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByRole('combobox'), 'zzz')

    expect(screen.getByRole('status')).toHaveTextContent('No matches')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('Escape closes and restores the selection; Escape again clears it', async () => {
    const onChange = vi.fn()
    render(<Harness initial="gulu" onChange={onChange} />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('Gulu University')

    await userEvent.type(input, 'xyz')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveValue('Gulu University')
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(input).toHaveValue('')
  })

  it('replaces the selected label when the user starts typing', async () => {
    const onChange = vi.fn()
    render(<Harness initial="makerere" onChange={onChange} />)

    await userEvent.type(screen.getByRole('combobox'), 'kya')

    expect(screen.getByRole('combobox')).toHaveValue('kya')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Kyambogo University'])
  })

  it('selects with a mouse click', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'Kyambogo University' }))

    expect(onChange).toHaveBeenLastCalledWith('kyambogo')
  })
})
