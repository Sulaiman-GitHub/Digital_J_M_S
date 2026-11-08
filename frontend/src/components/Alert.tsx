import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type AlertTone = 'danger' | 'success' | 'info'

const toneClasses: Record<AlertTone, string> = {
  danger: 'border-danger bg-danger-tint [&_strong]:text-danger',
  success: 'border-success bg-success-tint [&_strong]:text-success',
  info: 'border-info bg-info-tint [&_strong]:text-info',
}

const icons: Record<AlertTone, string> = { danger: '!', success: '✓', info: 'i' }

export interface AlertProps {
  tone?: AlertTone
  title?: string
  children: ReactNode
  className?: string
}

/** A boxed message. Danger is announced immediately (role="alert"); the others politely. */
export function Alert({ tone = 'danger', title, children, className }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-2 rounded-card border p-3 text-sm', toneClasses[tone], className)}
    >
      <strong aria-hidden="true">{icons[tone]}</strong>
      <p>
        {title && <strong>{title} </strong>}
        {children}
      </p>
    </div>
  )
}
