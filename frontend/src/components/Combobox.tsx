import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import { describedBy, hintClasses, inputClasses, labelClasses } from './fieldStyles'
import { FormError } from './FormError'
import type { SelectOption } from './Select'

export interface ComboboxProps {
  label: string
  options: SelectOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  hint?: string
  error?: string
  emptyText?: string
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * Searchable single select (WAI-ARIA combobox with a listbox popup).
 * Type to filter; ArrowUp/ArrowDown move, Home/End jump (while open), Enter selects,
 * Escape closes (or clears the value when already closed).
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder,
  hint,
  error,
  emptyText = 'No matches',
  disabled,
  id,
  className,
}: ComboboxProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const listId = `${inputId}-listbox`
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const optionId = (index: number) => `${inputId}-option-${index}`

  const selected = options.find((option) => option.value === value) ?? null
  // null = the user is not typing; the input shows the selected label.
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const filtered = query
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options
  const active = activeIndex >= 0 && activeIndex < filtered.length ? activeIndex : -1

  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' })
    }
    // optionId only depends on inputId, which never changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active])

  function close() {
    setOpen(false)
    setQuery(null)
    setActiveIndex(-1)
  }

  function choose(option: SelectOption) {
    onChange(option.value)
    close()
  }

  function openAt(index: number) {
    setOpen(true)
    setActiveIndex(index)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const last = filtered.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open)
          openAt(
            Math.max(
              filtered.findIndex((o) => o.value === value),
              0,
            ),
          )
        else setActiveIndex(Math.min(active + 1, last))
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!open) openAt(last)
        else setActiveIndex(Math.max(active - 1, 0))
        break
      case 'Home':
        if (open) {
          event.preventDefault()
          setActiveIndex(0)
        }
        break
      case 'End':
        if (open) {
          event.preventDefault()
          setActiveIndex(last)
        }
        break
      case 'Enter':
        if (open && active >= 0) {
          event.preventDefault()
          choose(filtered[active])
        }
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          close()
        } else if (value !== null) {
          event.preventDefault()
          onChange(null)
        }
        break
      case 'Tab':
        close()
        break
    }
  }

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
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hintId, errorId)}
          disabled={disabled}
          placeholder={placeholder}
          value={query ?? selected?.label ?? ''}
          onChange={(event) => {
            setQuery(event.target.value)
            openAt(0)
          }}
          // Select the current label so typing replaces it instead of appending to it.
          onFocus={(event) => event.target.select()}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={close}
          className={cn(inputClasses, 'pr-10')}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-secondary"
        >
          ▾
        </span>

        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!open || filtered.length === 0}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-card border border-border bg-white py-1 shadow-lg"
        >
          {filtered.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              // Keep focus in the input so blur does not close the list before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              onMouseMove={() => setActiveIndex(index)}
              className={cn(
                'flex min-h-11 cursor-pointer items-center justify-between px-3',
                index === active && 'bg-primary-tint',
                option.value === value && 'font-semibold',
              )}
            >
              {option.label}
              {option.value === value && <span aria-hidden="true">✓</span>}
            </li>
          ))}
        </ul>
        {open && filtered.length === 0 && (
          <p
            role="status"
            className="absolute z-20 mt-1 w-full rounded-card border border-border bg-white px-3 py-3 text-text-secondary shadow-lg"
          >
            {emptyText}
          </p>
        )}
      </div>
      {error && <FormError id={errorId}>{error}</FormError>}
    </div>
  )
}
