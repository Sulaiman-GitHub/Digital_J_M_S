import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface EmptyStateProps {
  title: string
  description?: string
  /** Usually one Button or Link telling the user what to do next. */
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-card border border-dashed border-text-secondary px-4 py-8 text-center',
        className,
      )}
    >
      <p className="text-title-sm font-semibold">{title}</p>
      {description && <p className="max-w-prose text-text-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
