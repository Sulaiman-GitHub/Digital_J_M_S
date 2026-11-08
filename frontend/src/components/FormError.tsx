import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface FormErrorProps {
  id?: string
  children: ReactNode
  /** Announce immediately (use for form-level errors shown after submit). */
  live?: boolean
  className?: string
}

export function FormError({ id, children, live = false, className }: FormErrorProps) {
  return (
    <p
      id={id}
      role={live ? 'alert' : undefined}
      className={cn('flex items-start gap-1 text-sm font-medium text-danger', className)}
    >
      <span aria-hidden="true" className="font-bold">
        !
      </span>
      <span>{children}</span>
    </p>
  )
}
