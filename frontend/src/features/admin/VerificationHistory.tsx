import type { VerificationEvent, VerificationStatus } from '../../api/types'
import { Card } from '../../components/Card'
import { cn } from '../../lib/cn'
import { formatDateTime } from '../../lib/dates'

const EVENT_TITLES: Record<VerificationStatus, string> = {
  draft: 'Moved to draft',
  pending: 'Sent for checking',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
}

/** Newest first, as people read a history. The API sends oldest first. */
export function VerificationHistory({ history }: { history: VerificationEvent[] }) {
  const entries = [...history].reverse()
  return (
    <Card aria-labelledby="history-title">
      <h2 id="history-title" className="text-lg font-semibold">
        History
      </h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-text-secondary">Nothing has happened yet. It has not been sent.</p>
      ) : (
        <ol aria-label="Verification history" className="mt-3">
          {entries.map((entry, index) => (
            <li key={entry.id} className="relative flex gap-3">
              <div className="flex flex-col items-center" aria-hidden="true">
                <span
                  className={cn(
                    'mt-1.5 size-3 shrink-0 rounded-pill border-2',
                    index === 0 ? 'border-primary bg-primary' : 'border-text-secondary bg-white',
                  )}
                />
                {index < entries.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-border" />}
              </div>
              <div className="pb-4">
                <p className="font-semibold">{EVENT_TITLES[entry.to_status]}</p>
                <p className="text-sm text-text-secondary">
                  <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
                  {entry.actor_email && ` · ${entry.actor_email}`}
                </p>
                {entry.reason && (
                  <p className="mt-1 rounded-card bg-surface px-3 py-2 text-sm">{entry.reason}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
