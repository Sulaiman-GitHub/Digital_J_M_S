import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useAuth } from '../auth/authContext'
import { answer } from './answer'
import { STARTER_QUESTIONS, type BotLink } from './knowledge'

interface Message {
  id: number
  from: 'bot' | 'user'
  text: string
  links?: BotLink[]
  suggestions?: string[]
}

const GREETING: Message = {
  id: 0,
  from: 'bot',
  text: 'Hi, I am the DJMS assistant. Ask me how to register, build a profile, apply for jobs or post a vacancy.',
  suggestions: STARTER_QUESTIONS,
}

const REPLY_DELAY_MS = 450

/**
 * A small help assistant. It does not use machine learning: answers come from a fixed script
 * (knowledge.ts) matched by keywords (answer.ts), so it can only say things we wrote and checked.
 */
export function Chatbot() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const nextId = useRef(1)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, thinking, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function ask(question: string) {
    const text = question.trim()
    if (!text || thinking) return
    const userMessage: Message = { id: nextId.current++, from: 'user', text }
    setMessages((current) => [...current, userMessage])
    setDraft('')
    setThinking(true)
    timer.current = window.setTimeout(() => {
      const reply = answer(text, user?.role)
      setMessages((current) => [...current, { id: nextId.current++, from: 'bot', ...reply }])
      setThinking(false)
    }, REPLY_DELAY_MS)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    ask(draft)
  }

  const lastBotId = [...messages].reverse().find((message) => message.from === 'bot')?.id

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="chatbot-panel"
        aria-label={open ? 'Close help chat' : 'Open help chat'}
        className="fixed right-4 bottom-36 z-40 grid size-14 cursor-pointer place-items-center rounded-pill bg-primary text-on-solid shadow-lg transition-transform hover:scale-105 md:bottom-6"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-7"
        >
          {open ? (
            <path d="M6 6l12 12M18 6 6 18" />
          ) : (
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
          )}
        </svg>
      </button>

      {open && (
        <section
          id="chatbot-panel"
          role="dialog"
          aria-label="Help chat"
          className="animate-rise fixed inset-x-3 bottom-52 z-40 flex max-h-[60svh] flex-col overflow-hidden rounded-card border border-border bg-card shadow-xl md:inset-x-auto md:right-4 md:bottom-24 md:w-96"
        >
          <header className="flex items-center gap-3 bg-linear-to-br from-hero-from to-hero-to px-4 py-3 text-white">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-pill bg-white/20 font-bold"
            >
              DJ
            </span>
            <div>
              <h2 className="font-semibold">DJMS assistant</h2>
              <p className="text-sm">Quick answers, no waiting</p>
            </div>
          </header>

          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            className="flex-1 space-y-3 overflow-y-auto p-4"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex flex-col gap-2', message.from === 'user' && 'items-end')}
              >
                <p
                  className={cn(
                    'max-w-[85%] rounded-card px-3 py-2',
                    message.from === 'user' ? 'bg-primary text-on-solid' : 'bg-surface text-text',
                  )}
                >
                  {message.text}
                </p>
                {message.links && (
                  <ul className="flex flex-wrap gap-2">
                    {message.links.map((link) => (
                      <li key={link.to + link.label}>
                        <Link
                          to={link.to}
                          onClick={() => setOpen(false)}
                          className="inline-flex min-h-9 items-center rounded-pill border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary-tint"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {message.id === lastBotId && message.suggestions && !thinking && (
                  <ul className="flex flex-wrap gap-2">
                    {message.suggestions.map((suggestion) => (
                      <li key={suggestion}>
                        <button
                          type="button"
                          onClick={() => ask(suggestion)}
                          className="min-h-9 cursor-pointer rounded-pill border border-border bg-card px-3 text-left text-sm hover:border-primary hover:bg-primary-tint"
                        >
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {thinking && (
              <p role="status" className="text-sm text-text-secondary">
                <span className="sr-only">The assistant is typing</span>
                <span aria-hidden="true">Typing…</span>
              </p>
            )}
          </div>

          <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-3">
            <label className="sr-only" htmlFor="chatbot-input">
              Your question
            </label>
            <input
              id="chatbot-input"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={300}
              autoComplete="off"
              placeholder="Type your question"
              className="min-h-11 min-w-0 flex-1 rounded-card border border-text-secondary bg-card px-3 text-text"
            />
            <button
              type="submit"
              disabled={!draft.trim() || thinking}
              className="min-h-11 cursor-pointer rounded-card bg-primary px-4 font-semibold text-on-solid disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </form>
        </section>
      )}
    </>
  )
}
