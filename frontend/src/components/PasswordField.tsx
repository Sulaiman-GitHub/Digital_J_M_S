import { useId, useState, type ComponentPropsWithRef, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { describedBy, hintClasses, inputClasses, labelClasses } from './fieldStyles'
import { FormError } from './FormError'

export interface PasswordFieldProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'size'> {
  label: string
  hint?: string
  error?: string
  /** Shown to the right of the label, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode
}

/** Password input with a Show/Hide toggle (so there is no "confirm password" field). */
export function PasswordField({
  label,
  hint,
  error,
  labelAction,
  id,
  className,
  ...rest
}: PasswordFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const [visible, setVisible] = useState(false)

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className={labelClasses}>
          {label}
        </label>
        {labelAction}
      </div>
      {hint && (
        <p id={hintId} className={hintClasses}>
          {hint}
        </p>
      )}
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hintId, errorId)}
          className={cn(inputClasses, 'pr-20')}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={`Show ${label.toLowerCase()}`}
          className="absolute top-1/2 right-1 min-h-11 -translate-y-1/2 cursor-pointer rounded-card px-3 text-sm font-semibold text-primary"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <FormError id={errorId}>{error}</FormError>}
    </div>
  )
}
