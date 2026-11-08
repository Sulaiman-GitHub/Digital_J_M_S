import type { ComponentPropsWithRef } from 'react'
import { cn } from '../lib/cn'

export interface PillProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  label: string
  /** Toggle chip: sets aria-pressed. Leave undefined for a plain action chip. */
  selected?: boolean
  /** Removable chip (active filter): shows ✕ and an accessible "Remove filter" name. */
  onRemove?: () => void
}

export function Pill({ label, selected, onRemove, onClick, className, ...rest }: PillProps) {
  const removable = onRemove !== undefined
  return (
    <button
      type="button"
      aria-pressed={removable ? undefined : selected}
      aria-label={removable ? `Remove filter: ${label}` : undefined}
      onClick={removable ? () => onRemove() : onClick}
      className={cn(
        'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-pill border px-3.5 text-sm font-medium whitespace-nowrap',
        // An invisible ::after extends the 36 px pill to a 44 px tap target.
        'relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-[""]',
        selected
          ? 'border-primary bg-primary text-white'
          : removable
            ? 'border-primary bg-primary-tint text-primary'
            : 'border-text-secondary bg-white text-text hover:border-primary',
        className,
      )}
      {...rest}
    >
      {label}
      {removable && <span aria-hidden="true">✕</span>}
    </button>
  )
}
