import { cn } from '../lib/cn'
import { Button } from './Button'

export interface ErrorStateProps {
  title?: string
  message?: string
  onRetry: () => void
  /** True while the retry request is running. */
  retrying?: boolean
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Please check your connection and try again.',
  onRetry,
  retrying = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-2 rounded-card border border-danger bg-danger-tint p-4',
        className,
      )}
    >
      <p className="font-semibold text-danger">{title}</p>
      <p className="text-text">{message}</p>
      <Button variant="secondary" onClick={onRetry} loading={retrying} className="mt-1">
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  )
}
