// Shared look for text-like inputs. 16 px text so phones do not zoom on focus.
export const inputClasses =
  'block min-h-12 w-full rounded-card border border-text-secondary bg-card px-3 text-base text-text ' +
  'placeholder:text-text-secondary disabled:cursor-not-allowed disabled:bg-surface ' +
  'aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger'

export const labelClasses = 'block text-sm font-semibold text-text'

export const hintClasses = 'text-sm text-text-secondary'

/** Build aria-describedby from optional hint and error ids. */
export function describedBy(...ids: Array<string | false | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(' ')
  return value || undefined
}
