import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CompanyAvatar } from './CompanyAvatar'

const text = (name: string) => render(<CompanyAvatar name={name} />).container.textContent

describe('CompanyAvatar', () => {
  it('shows the first letters of the first two words, in capitals', () => {
    expect(text('Ssese Foods Ltd')).toBe('SF')
    expect(text('nile basin logistics')).toBe('NB')
  })

  it('uses the first two letters of a one-word name, and a question mark for none', () => {
    expect(text('Mbarara')).toBe('MB')
    expect(text('   ')).toBe('?')
  })

  it('is decorative: hidden from screen readers', () => {
    const { container } = render(<CompanyAvatar name="Gulu Hardware" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('gives the same company the same colours every time', () => {
    const first = render(<CompanyAvatar name="Gulu Hardware" />).container.firstElementChild
    const second = render(<CompanyAvatar name="Gulu Hardware" />).container.firstElementChild
    expect(first?.className).toBe(second?.className)
  })

  it('shows the picture when there is one, and falls back to the initials if it cannot load', () => {
    const { container } = render(<CompanyAvatar name="Gulu Hardware" imageUrl="/logo.png" />)
    const image = container.querySelector('img') as HTMLImageElement
    expect(image).toHaveAttribute('src', '/logo.png')
    expect(image).toHaveAttribute('alt', '')
    expect(container.textContent).toBe('')

    fireEvent.error(image)

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('GH')
  })

  it('shows the initials when the address is null or empty', () => {
    expect(
      render(<CompanyAvatar name="Gulu Hardware" imageUrl={null} />).container.textContent,
    ).toBe('GH')
    expect(render(<CompanyAvatar name="Gulu Hardware" imageUrl="" />).container.textContent).toBe(
      'GH',
    )
  })
})
