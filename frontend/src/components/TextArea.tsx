import { useId, type ComponentPropsWithRef } from 'react'
import { cn } from '../lib/cn'
import { describedBy, hintClasses, inputClasses, labelClasses } from './fieldStyles'
import { FormError } from './FormError'

export interface TextAreaProps extends ComponentPropsWithRef<'textarea'> {
  label: string
  hint?: string
  error?: string
}

export function TextArea({ label, hint, error, id, className, rows = 4, ...rest }: TextAreaProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={inputId} className={labelClasses}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={hintClasses}>
          {hint}
        </p>
      )}
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId)}
        className={cn(inputClasses, 'py-2')}
        {...rest}
      />
      {error && <FormError id={errorId}>{error}</FormError>}
    </div>
  )
}
