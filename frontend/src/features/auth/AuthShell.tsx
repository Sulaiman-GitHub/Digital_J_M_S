import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'

export interface AuthShellProps {
  title: string
  lead?: string
  /** Centre the content (used for the "check your email" and verify result screens). */
  centered?: boolean
  children: ReactNode
}

/** Narrow centred column used by every auth screen. */
export function AuthShell({ title, lead, centered = false, children }: AuthShellProps) {
  return (
    <section
      aria-labelledby="auth-title"
      className={cn(
        'mx-auto w-full max-w-md rounded-card border border-border bg-white p-5 shadow-sm sm:my-6 sm:p-8',
        centered && 'text-center',
      )}
    >
      <h1 id="auth-title" className="text-title-md font-semibold">
        {title}
      </h1>
      {lead && <p className="mt-1 text-text-secondary">{lead}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  )
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="rounded font-semibold text-primary underline">
      {children}
    </Link>
  )
}
