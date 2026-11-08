import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { describedBy, hintClasses } from './fieldStyles'
import { FormError } from './FormError'

export interface CheckboxProps extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  /** Text, or text with links (for example the Terms). */
  label: ReactNode
  hint?: ReactNode
  error?: string
}

export function Checkbox({ label, hint, error, id, className, ...rest }: CheckboxProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hintId, errorId)}
          className="size-5 shrink-0 cursor-pointer accent-primary"
          {...rest}
        />
        <span>{label}</span>
      </label>
      {hint && (
        <p id={hintId} className={cn(hintClasses, 'pl-8')}>
          {hint}
        </p>
      )}
      {error && (
        <FormError id={errorId} className="pl-8">
          {error}
        </FormError>
      )}
    </div>
  )
}
