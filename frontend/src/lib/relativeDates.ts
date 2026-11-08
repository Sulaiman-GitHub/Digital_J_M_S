import { DISPLAY_TIME_ZONE, formatDate } from './dates'

const dayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Whole calendar days from `from` to `to`, judged in Africa/Kampala. */
export function calendarDaysBetween(from: string | Date, to: string | Date): number {
  const start = Date.parse(`${dayKey.format(new Date(from))}T00:00:00Z`)
  const end = Date.parse(`${dayKey.format(new Date(to))}T00:00:00Z`)
  return Math.round((end - start) / MS_PER_DAY)
}

/** "Posted today", "Posted yesterday", "Posted 3 days ago", "Posted 2 weeks ago", then a date. */
export function postedLabel(publishedAt: string, now: Date = new Date()): string {
  const days = Math.max(0, calendarDaysBetween(publishedAt, now))
  if (days === 0) return 'Posted today'
  if (days === 1) return 'Posted yesterday'
  if (days < 7) return `Posted ${days} days ago`
  if (days < 14) return 'Posted 1 week ago'
  if (days < 30) return `Posted ${Math.floor(days / 7)} weeks ago`
  return `Posted ${formatDate(publishedAt)}`
}

/** Whole days left, counting today. 0 means it closes today. */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, calendarDaysBetween(now, expiresAt))
}

/** A closing warning for the last week only: "Closes today", "Closes in 2 days"; else null. */
export function closingSoonLabel(expiresAt: string, now: Date = new Date()): string | null {
  const days = daysLeft(expiresAt, now)
  if (days > 7) return null
  if (days === 0) return 'Closes today'
  if (days === 1) return 'Closes tomorrow'
  return `Closes in ${days} days`
}
