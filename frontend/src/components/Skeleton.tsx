import { cn } from '../lib/cn'

/**
 * Grey placeholder block shown while content loads (instead of a spinner).
 * Size it with className. Wrap a group of skeletons in an element with role="status"
 * and screen-reader text such as "Loading vacancies" so the state is announced.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-surface', className)} />
}
