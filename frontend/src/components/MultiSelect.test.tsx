import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MultiSelect, type MultiSelectItem } from './MultiSelect'

const ALL: MultiSelectItem[] = [
  { id: '1', name: 'Python' },
  { id: '2', name: 'Microsoft Excel' },
  { id: '3', name: 'Customer service' },
]

function Harness({
  initial = [],
  max = 3,
  onQuery,
}: {
  initial?: MultiSelectItem[]
  max?: number
  onQuery?: (q: string) => void
}) {
  const [selected, setSelected] = useState<MultiSelectItem[]>(initial)
  const [query, setQuery] = useState('')
  const results = ALL.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <MultiSelect
      label="Add skills"
      noun="skills"
      selected={selected}
      onChange={setSelected}
      results={results}
      onQueryChange={(q) => {
        setQuery(q)
        onQuery?.(q)
      }}
      max={max}
      hint="Up to 3."
    />
  )
}

const chips = () =>
  screen.queryAllByRole('listitem').map((item) => item.textContent?.replace('✕', ''))

describe('MultiSelect', () => {
  it('shows suggestions, adds the chosen one as a chip and clears the search', async () => {
    const onQuery = vi.fn()
    render(<Harness onQuery={onQuery} />)

    await userEvent.type(screen.getByRole('combobox', { name: 'Add skills' }), 'exc')
    await userEvent.click(screen.getByRole('option', { name: 'Microsoft Excel' }))

    expect(chips()).toEqual(['Microsoft Excel'])
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(onQuery).toHaveBeenLastCalledWith('')
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument()
  })

  it('works with the keyboard: arrows move, Enter adds, Escape closes', async () => {
    render(<Harness />)
    const input = screen.getByRole('combobox')

    await userEvent.click(input)
    // Nothing is highlighted yet, so the first ArrowDown highlights the first option.
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(chips()).toEqual(['Python'])

    // Now Python is chosen, so it is not offered again: ArrowDown twice reaches the second left.
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(chips()).toEqual(['Python', 'Customer service'])

    await userEvent.click(input)
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not offer items that are already chosen', async () => {
    render(<Harness initial={[ALL[0]]} />)

    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.queryByRole('option', { name: 'Python' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Customer service' })).toBeInTheDocument()
  })

  it('removes a chip with its own button', async () => {
    render(<Harness initial={[ALL[0], ALL[1]]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Python' }))

    expect(chips()).toEqual(['Microsoft Excel'])
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument()
  })

  it('stops at the maximum: the input is disabled and says why', async () => {
    render(<Harness initial={ALL} max={3} />)

    const input = screen.getByRole('combobox')
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('placeholder', 'Maximum of 3 skills chosen')
    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Python' }))
    expect(screen.getByRole('combobox')).toBeEnabled()
  })

  it('says when nothing matches', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByRole('combobox'), 'zzz')

    expect(screen.getByRole('status')).toHaveTextContent('No matches')
  })

  it('does not submit a surrounding form when Enter picks an item', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>,
    )

    await userEvent.type(screen.getByRole('combobox'), 'py{Enter}')

    expect(chips()).toEqual(['Python'])
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('links the hint and an error to the input', () => {
    render(
      <MultiSelect
        label="Add skills"
        noun="skills"
        selected={[]}
        onChange={() => {}}
        results={[]}
        onQueryChange={() => {}}
        max={3}
        hint="Up to 3."
        error="Choose at most 3 skills."
      />,
    )

    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/Up to 3\./)
    expect(input).toHaveAccessibleDescription(/Choose at most 3 skills\./)
  })
})
