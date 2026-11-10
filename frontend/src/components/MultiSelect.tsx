import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import { describedBy, hintClasses, inputClasses, labelClasses } from './fieldStyles'
import { FormError } from './FormError'

export interface MultiSelectItem {
  id: string
  name: string
}

export interface MultiSelectProps<T extends MultiSelectItem> {
  label: string
  /** What the chosen items are called, for the counter and remove buttons ("skills"). */
  noun: string
  selected: T[]
  onChange: (items: T[]) => void
  /** Suggestions for the current search text (the parent fetches them). */
  results: T[]
  onQueryChange: (query: string) => void
  loading?: boolean
  max: number
  hint?: string
  error?: string
  placeholder?: string
  emptyText?: string
  className?: string
}

/**
 * Search, pick from a list, see the picks as removable chips. Keyboard: ArrowUp/Down move,
 * Enter adds, Escape closes. Items already chosen are not offered again.
 */
export function MultiSelect<T extends MultiSelectItem>({
  label,
  noun,
  selected,
  onChange,
  results,
  onQueryChange,
  loading = false,
  max,
  hint,
  error,
  placeholder,
  emptyText = 'No matches',
  className,
}: MultiSelectProps<T>) {
  const id = useId()
  const listId = `${id}-list`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const optionId = (index: number) => `${id}-option-${index}`
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const chosen = new Set(selected.map((item) => item.id))
  const options = results.filter((item) => !chosen.has(item.id))
  const active = activeIndex >= 0 && activeIndex < options.length ? activeIndex : -1
  const full = selected.length >= max

  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' })
    }
    // optionId only depends on id, which never changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active])

  function changeQuery(value: string) {
    setQuery(value)
    onQueryChange(value)
    setOpen(true)
    setActiveIndex(0)
  }

  function add(item: T) {
    if (full) return
    onChange([...selected, item])
    setQuery('')
    onQueryChange('')
    setActiveIndex(-1)
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setOpen(true)
        setActiveIndex(Math.min(active + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex(Math.max(active - 1, 0))
        break
      case 'Enter':
        if (open && active >= 0) {
          event.preventDefault() // do not submit the surrounding form
          add(options[active])
        }
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          setOpen(false)
        }
        break
    }
  }

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className={labelClasses}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={hintClasses}>
          {hint}
        </p>
      )}
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hintId, errorId)}
          disabled={full}
          placeholder={full ? `Maximum of ${max} ${noun} chosen` : placeholder}
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={inputClasses}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!open || options.length === 0}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-card border border-border bg-card py-1 shadow-lg"
        >
          {options.map((item, index) => (
            <li
              key={item.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // Keep focus in the input so blur does not close the list before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(item)}
              onMouseMove={() => setActiveIndex(index)}
              className={cn(
                'flex min-h-11 cursor-pointer items-center px-3',
                index === active && 'bg-primary-tint',
              )}
            >
              {item.name}
            </li>
          ))}
        </ul>
        {open && !loading && query.trim() !== '' && options.length === 0 && (
          <p
            role="status"
            className="absolute z-20 mt-1 w-full rounded-card border border-border bg-card px-3 py-3 text-text-secondary shadow-lg"
          >
            {emptyText}
          </p>
        )}
      </div>
      <p aria-live="polite" className="text-right text-sm text-text-secondary">
        {selected.length} of {max} selected
      </p>
      {error && <FormError id={errorId}>{error}</FormError>}
      {selected.length > 0 && (
        <ul aria-label={`Selected ${noun}`} className="flex flex-wrap gap-2 pt-1">
          {selected.map((item) => (
            <li
              key={item.id}
              className="inline-flex min-h-9 items-center gap-1 rounded-pill border border-primary bg-primary-tint pr-1 pl-3 text-sm font-semibold text-primary"
            >
              {item.name}
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                onClick={() => onChange(selected.filter((other) => other.id !== item.id))}
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-pill"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
