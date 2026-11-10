import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/dates'
import { useDismiss } from '../../lib/useDismiss'
import { useMyApplications } from '../applications/useApplications'
import { useAuth } from '../auth/authContext'
import { useProfile } from '../profile/useProfileData'
import { buildNotifications, readSeenAt, unreadCount, writeSeenAt } from './notifications'

/** The bell for job seekers: employer decisions and unfinished set-up, with an unread badge. */
export function NotificationBell() {
  const { user } = useAuth()
  const isSeeker = user?.role === 'job_seeker'
  const applications = useMyApplications(1)
  const profile = useProfile(isSeeker)
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState<string | null>(() => (user ? readSeenAt(user.id) : null))
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const items = useMemo(
    () =>
      buildNotifications({
        applications: applications.data?.data ?? [],
        profile: profile.data,
        emailVerified: user?.email_verified ?? true,
      }),
    [applications.data, profile.data, user?.email_verified],
  )

  const close = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])
  useDismiss(open, close, containerRef)

  if (!user || !isSeeker) return null

  const unread = unreadCount(items, seenAt)

  function markAllRead() {
    const now = new Date().toISOString()
    writeSeenAt(user!.id, now)
    setSeenAt(now)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="notifications-panel"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative inline-flex size-10 cursor-pointer items-center justify-center rounded-pill border border-border bg-card text-text hover:bg-primary-tint sm:size-11"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-5"
        >
          <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Zm4 10a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-pill bg-danger px-1 text-xs font-bold text-on-solid"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          id="notifications-panel"
          aria-label="Notifications"
          className="animate-rise absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-card shadow-xl max-sm:fixed max-sm:inset-x-4 max-sm:top-16 max-sm:w-auto"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="font-semibold">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="cursor-pointer text-sm font-semibold text-primary underline"
              >
                Mark all as read
              </button>
            )}
          </header>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-text-secondary">
              You are all caught up. Updates on your applications will appear here.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {items.map((item) => {
                const isUnread = item.at === null || seenAt === null || item.at > seenAt
                return (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'block px-4 py-3 hover:bg-surface',
                        isUnread && 'bg-primary-tint',
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-semibold">{item.title}</span>
                        {isUnread && <span className="sr-only">Unread</span>}
                      </span>
                      <span className="block text-sm text-text-secondary">{item.detail}</span>
                      {item.at && (
                        <span className="mt-1 block text-xs text-text-secondary">
                          {formatDate(item.at)}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
