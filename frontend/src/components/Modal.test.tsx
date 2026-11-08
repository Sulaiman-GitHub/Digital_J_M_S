import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'
import { Modal } from './Modal'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Withdraw application?"
        footer={<Button onClick={() => setOpen(false)}>Confirm</Button>}
      >
        <p>Body text</p>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('opens with its title, focuses inside, and Escape closes it and returns focus', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open' })

    await userEvent.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Withdraw application?' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByText('Body text')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('closes with the Close button', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByText('Body text')).not.toBeInTheDocument()
  })
})
