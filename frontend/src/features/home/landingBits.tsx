import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Content width for the landing page bands (the bands themselves run edge to edge). */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4', className)}>{children}</div>
}

/** A full-width band. `tone` picks the background. */
export function Band({
  tone = 'plain',
  className,
  children,
}: {
  tone?: 'plain' | 'tint'
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('py-12 md:py-16', tone === 'tint' ? 'bg-surface' : 'bg-bg', className)}>
      <Container>{children}</Container>
    </div>
  )
}

/** The small coloured label above a section heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'flex items-center gap-2 text-xs font-bold tracking-wide text-primary uppercase',
        className,
      )}
    >
      <span aria-hidden="true">▸▸</span>
      {children}
    </p>
  )
}
