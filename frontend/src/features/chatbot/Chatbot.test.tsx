import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Chatbot } from './Chatbot'
import { loggedIn, makeUser, mockApi, renderRoutes } from '../../test/utils'

function renderBot(routes: Record<string, unknown> = {}) {
  mockApi(routes as never)
  return renderRoutes(
    [
      { path: '/', element: <Chatbot /> },
      { path: '/jobs', element: <p>Jobs page</p> },
    ],
    { route: '/' },
  )
}

const openBot = () => userEvent.click(screen.getByRole('button', { name: 'Open help chat' }))
const ask = async (question: string) => {
  await userEvent.type(screen.getByLabelText('Your question'), question)
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('Chatbot', () => {
  it('is closed until the button is pressed, then greets and focuses the box', async () => {
    renderBot()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openBot()

    expect(screen.getByRole('dialog', { name: 'Help chat' })).toBeInTheDocument()
    expect(screen.getByText(/I am the DJMS assistant/)).toBeInTheDocument()
    expect(screen.getByLabelText('Your question')).toHaveFocus()
  })

  it('answers a typed question', async () => {
    renderBot()
    await openBot()

    await ask('how do I apply for a job?')

    expect(screen.getByText('how do I apply for a job?')).toBeInTheDocument()
    expect(await screen.findByText(/Open a job and press Apply/)).toBeInTheDocument()
    expect(screen.getByLabelText('Your question')).toHaveValue('')
  })

  it('answers the one-tap suggestions and offers new ones', async () => {
    renderBot()
    await openBot()

    await userEvent.click(screen.getByRole('button', { name: 'How do I create a profile?' }))

    expect(await screen.findByText(/Your profile has sections/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'How do I upload my CV?' })).toBeInTheDocument()
  })

  it('does not send an empty question', async () => {
    renderBot()
    await openBot()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('links to a page and closes itself when the link is used', async () => {
    renderBot()
    await openBot()
    await ask('find jobs')

    const log = screen.getByRole('log', { name: 'Conversation' })
    await userEvent.click(await within(log).findByRole('link', { name: 'Browse jobs' }))

    expect(await screen.findByText('Jobs page')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes with Escape and returns focus to its button', async () => {
    renderBot()
    await openBot()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open help chat' })).toHaveFocus()
  })

  it('tailors answers to the signed-in role', async () => {
    renderBot(loggedIn(makeUser({ role: 'employer' })))
    await openBot()
    await ask('how do i register')

    expect(await screen.findByText(/already have an account/)).toBeInTheDocument()
  })

  it('shows the fallback for something it cannot answer', async () => {
    renderBot()
    await openBot()
    await ask('qwerty zxcv')

    expect(await screen.findByText(/did not understand/)).toBeInTheDocument()
  })
})
