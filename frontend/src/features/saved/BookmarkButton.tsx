import { ApiError } from '../../api/types'
import { useToast } from '../../components/toastContext'
import { cn } from '../../lib/cn'
import { useAuth } from '../auth/authContext'
import { useSavedIds, useToggleSaved } from './useSaved'

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5.5"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M6 3h12v18l-6-4.5L6 21V3Z" />
    </svg>
  )
}

/**
 * Save or remove a vacancy. Only job seekers see it (nobody else can save), so it is simply
 * absent for visitors, employers and admins. `variant="icon"` is the round bookmark on a card;
 * `variant="text"` is the "Save job" button on the vacancy page.
 */
export function BookmarkButton({
  vacancyId,
  title,
  variant = 'icon',
  className,
}: {
  vacancyId: string
  title: string
  variant?: 'icon' | 'text'
  className?: string
}) {
  const { user } = useAuth()
  const isSeeker = user?.role === 'job_seeker'
  const saved = useSavedIds(isSeeker)
  const toggle = useToggleSaved()
  const toast = useToast()
  if (!isSeeker) return null

  const isSaved = saved.data?.includes(vacancyId) ?? false

  function onClick() {
    toggle.mutate(
      { vacancyId, save: !isSaved },
      {
        onError: (error) =>
          toast.show({
            message:
              error instanceof ApiError && error.status === 409
                ? error.message
                : error instanceof ApiError && error.status === 404
                  ? 'This job is no longer open.'
                  : 'Could not update your saved jobs. Try again.',
            tone: 'error',
          }),
      },
    )
  }

  if (variant === 'text') {
    return (
      <button
        type="button"
        aria-pressed={isSaved}
        onClick={onClick}
        className={cn(
          'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-card border px-4 font-semibold',
          isSaved
            ? 'border-primary bg-primary-tint text-primary'
            : 'border-primary bg-white text-primary hover:bg-primary-tint',
          className,
        )}
      >
        <BookmarkIcon filled={isSaved} />
        {isSaved ? 'Saved' : 'Save job'}
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={isSaved}
      aria-label={isSaved ? `Remove from saved jobs: ${title}` : `Save job: ${title}`}
      onClick={onClick}
      className={cn(
        'grid size-11 cursor-pointer place-items-center rounded-pill text-primary hover:bg-primary-tint',
        className,
      )}
    >
      <BookmarkIcon filled={isSaved} />
    </button>
  )
}
