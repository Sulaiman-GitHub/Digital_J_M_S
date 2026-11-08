import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Action buttons, shown at the bottom. */
  footer?: ReactNode
  className?: string
}

/**
 * Dialog built on the native <dialog> element: showModal() makes the rest of the page inert
 * and keeps focus inside. Escape, the close button and a click on the backdrop call onClose.
 * Focus returns to the element that was focused before opening.
 */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.setAttribute('open', '') // environments without <dialog> support (tests)
      }
      const firstFocusable = dialog.querySelector<HTMLElement>(
        'input, select, textarea, button:not([data-close]), [href], [tabindex]:not([tabindex="-1"])',
      )
      ;(firstFocusable ?? dialog.querySelector<HTMLElement>('[data-close]'))?.focus()
      return () => {
        if (typeof dialog.close === 'function') dialog.close()
        else dialog.removeAttribute('open')
        returnFocusRef.current?.focus()
      }
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault() // let React state decide when it closes
        onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose() // backdrop click
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-lg rounded-card bg-white p-0 text-text shadow-xl',
        'backdrop:bg-scrim',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
            <h2 id={titleId} className="text-title-sm font-semibold">
              {title}
            </h2>
            <button
              type="button"
              data-close
              onClick={onClose}
              aria-label="Close"
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-card text-text-secondary hover:bg-surface"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div className="overflow-auto px-4 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}
