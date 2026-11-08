import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'
import { pageItems } from './pageItems'

describe('Pagination', () => {
  it('marks the current page and moves with Previous, Next and page buttons', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={2} pageCount={5} onPageChange={onPageChange} />)

    const nav = screen.getByRole('navigation', { name: 'Pagination' })
    expect(within(nav).getByRole('button', { name: 'Page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await userEvent.click(within(nav).getByRole('button', { name: /previous/i }))
    await userEvent.click(within(nav).getByRole('button', { name: /next/i }))
    await userEvent.click(within(nav).getByRole('button', { name: 'Page 5' }))

    expect(onPageChange.mock.calls).toEqual([[1], [3], [5]])
  })

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()

    rerender(<Pagination page={3} pageCount={3} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('does not call onPageChange when the current page is clicked', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={2} pageCount={3} onPageChange={onPageChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => {}} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('pageItems', () => {
  it('lists every page when there are 7 or fewer', () => {
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('keeps first, last and neighbours with ellipses in between', () => {
    expect(pageItems(6, 12)).toEqual([1, 'ellipsis-start', 5, 6, 7, 'ellipsis-end', 12])
    expect(pageItems(1, 12)).toEqual([1, 2, 'ellipsis-end', 12])
    expect(pageItems(12, 12)).toEqual([1, 'ellipsis-start', 11, 12])
  })
})
