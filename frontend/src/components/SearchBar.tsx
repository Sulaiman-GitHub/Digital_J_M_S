import { useId, type FormEvent } from 'react'
import { cn } from '../lib/cn'

export interface SearchBarProps {
  whatLabel: string
  whatValue: string
  onWhatChange: (value: string) => void
  whatPlaceholder?: string
  whatMaxLength?: number
  whereLabel: string
  whereValue: string
  onWhereChange: (value: string) => void
  wherePlaceholder: string
  districts: { id: string; name: string }[]
  submitLabel: string
  onSubmit: (event: FormEvent) => void
  className?: string
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 text-text-secondary">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
      />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 text-text-secondary">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Zm0-8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      />
    </svg>
  )
}

/**
 * One rounded bar: what and where side by side, with the search button at the end. On phones the
 * two fields stack. The labels are for screen readers; the icons and placeholders show sighted
 * users what each field is.
 */
export function SearchBar({
  whatLabel,
  whatValue,
  onWhatChange,
  whatPlaceholder = 'Job title or skill',
  whatMaxLength,
  whereLabel,
  whereValue,
  onWhereChange,
  wherePlaceholder,
  districts,
  submitLabel,
  onSubmit,
  className,
}: SearchBarProps) {
  const whatId = useId()
  const whereId = useId()
  const field =
    'flex min-h-12 flex-1 items-center gap-2 rounded-card border border-text-secondary bg-white px-3 ' +
    'md:rounded-none md:border-0 md:bg-transparent'
  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className={cn(
        'space-y-2 rounded-card bg-white p-3 text-text shadow-md',
        'md:flex md:items-center md:gap-0 md:space-y-0 md:rounded-pill md:border md:border-text-secondary md:p-1.5 md:pl-4',
        className,
      )}
    >
      <label htmlFor={whatId} className="sr-only">
        {whatLabel}
      </label>
      <div className={cn(field, 'md:flex-[3]')}>
        <SearchIcon />
        <input
          id={whatId}
          type="search"
          maxLength={whatMaxLength}
          placeholder={whatPlaceholder}
          value={whatValue}
          onChange={(event) => onWhatChange(event.target.value)}
          className="min-h-11 w-full bg-transparent text-base text-text placeholder:text-text-secondary focus:outline-none"
        />
      </div>
      <label htmlFor={whereId} className="sr-only">
        {whereLabel}
      </label>
      <div className={cn(field, 'md:flex-[2] md:border-l md:border-border md:pl-4')}>
        <PinIcon />
        <select
          id={whereId}
          value={whereValue}
          onChange={(event) => onWhereChange(event.target.value)}
          className="min-h-11 w-full bg-transparent text-base text-text focus:outline-none"
        >
          <option value="">{wherePlaceholder}</option>
          {districts.map((district) => (
            <option key={district.id} value={district.id}>
              {district.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-card bg-primary px-6 font-semibold text-white transition-colors hover:bg-primary-hover md:w-auto md:rounded-pill"
      >
        {submitLabel}
      </button>
    </form>
  )
}
