import { useId, type ComponentPropsWithRef } from 'react'
import { cn } from '../lib/cn'
import { describedBy, hintClasses, inputClasses, labelClasses } from './fieldStyles'
import { FormError } from './FormError'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  label: string
  options: SelectOption[]
  /** Optional first option with an empty value, e.g. "All districts". */
  placeholder?: string
  hint?: string
  error?: string
}

export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  id,
  className,
  ...rest
}: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  const hintId = hint ? `${selectId}-hint` : undefined
  const errorId = error ? `${selectId}-error` : undefined

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={selectId} className={labelClasses}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={hintClasses}>
          {hint}
        </p>
      )}
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId)}
        className={inputClasses}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <FormError id={errorId}>{error}</FormError>}
    </div>
  )
}
