import type { ApplicationStatus } from '../lib/applicationStatus'
import { cn } from '../lib/cn'
import { formatDateTime } from '../lib/dates'
import { StatusBadge } from './StatusBadge'

export interface TimelineEntry {
  status: ApplicationStatus
  /** ISO 8601 UTC timestamp from the API. */
  at: string
  note?: string
}

export interface StatusTimelineProps {
  /** Newest first. */
  entries: TimelineEntry[]
  className?: string
}

export function StatusTimeline({ entries, className }: StatusTimelineProps) {
  return (
    <ol aria-label="Application history" className={cn('relative space-y-4', className)}>
      {entries.map((entry, index) => (
        <li key={`${entry.status}-${entry.at}`} className="relative flex gap-3">
          <div className="flex flex-col items-center" aria-hidden="true">
            <span
              className={cn(
                'mt-1.5 size-3 shrink-0 rounded-pill border-2',
                index === 0 ? 'border-primary bg-primary' : 'border-text-secondary bg-white',
              )}
            />
            {index < entries.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-border" />}
          </div>
          <div className="pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={entry.status} />
              <time dateTime={entry.at} className="text-sm text-text-secondary">
                {formatDateTime(entry.at)}
              </time>
            </div>
            {entry.note && <p className="mt-1 text-text">{entry.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
