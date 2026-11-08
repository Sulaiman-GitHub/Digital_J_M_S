// Dates are stored in UTC and shown in Africa/Kampala time.
export const DISPLAY_TIME_ZONE = 'Africa/Kampala'

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

const isoDayInKampala = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's date as YYYY-MM-DD in Africa/Kampala (the zone dates are judged in). */
export function todayInKampala(now: Date = new Date()): string {
  return isoDayInKampala.format(now)
}

/** Add whole years to a YYYY-MM-DD date (a Feb 29 start moves to Mar 1 in non-leap years). */
export function addYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const moved = new Date(Date.UTC(year + years, month - 1, day))
  return moved.toISOString().slice(0, 10)
}

/** Add whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** The calendar date (YYYY-MM-DD) of an instant, in Africa/Kampala. */
export function dayInKampala(iso: string): string {
  return isoDayInKampala.format(new Date(iso))
}
