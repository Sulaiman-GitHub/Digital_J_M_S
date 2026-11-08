import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type BadgeTone =
  'neutral' | 'outline' | 'primary' | 'info' | 'teal' | 'warning' | 'success' | 'danger'

// Text colour on its tint, with a border in the same colour (docs/design/tokens.md).
const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-text-secondary bg-surface text-text-secondary',
  outline: 'border-text-secondary bg-white text-text-secondary',
  primary: 'border-primary bg-primary-tint text-primary',
  info: 'border-info bg-info-tint text-info',
  teal: 'border-teal bg-teal-tint text-teal',
  warning: 'border-warning bg-accent-tint text-warning',
  success: 'border-success bg-success-tint text-success',
  danger: 'border-danger bg-danger-tint text-danger',
}

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-sm font-semibold whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
