import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useDismiss } from '../lib/useDismiss'

export interface FilterChipProps {
  label: string
  /** What is chosen now (shown in the chip); undefined when the filter is off. */
  value?: string
  children: (close: () => void) => ReactNode
}

/** A rounded filter chip that opens a small panel below it (Indeed-style filter row). */
export function FilterChip({ label, value, children }: FilterChipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const wasOpen = useRef(false)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, ref)
  // Closing (a choice, Escape) returns focus to the chip, as in the other menus.
  useEffect(() => {
    if (open) wasOpen.current = true
    else if (wasOpen.current) buttonRef.current?.focus()
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-pill border px-4 text-sm font-medium whitespace-nowrap',
          value
            ? 'border-primary bg-primary-tint text-primary'
            : 'border-text-secondary bg-card text-text hover:border-primary',
        )}
      >
        {value ? `${label}: ${value}` : label}
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute top-full left-0 z-20 mt-2 max-h-80 w-64 overflow-y-auto rounded-card border border-border bg-card p-3 shadow-lg"
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}
