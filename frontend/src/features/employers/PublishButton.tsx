import { useId, type ComponentPropsWithoutRef, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { buttonClasses } from '../../components/buttonStyles'
import { cn } from '../../lib/cn'
import { publishBlockedReason } from './verification'
import { useEmployerAccess } from './useEmployerData'

export interface PublishButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onClick'> {
  /** Where the button leads when publishing is allowed. */
  to?: string
  /** Full width (the default), or as wide as its text. */
  fullWidth?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

/**
 * Every "publish" or "post a vacancy" action uses this. Until the employer is approved it stays
 * visible but disabled, with the reason written next to it. The server refuses publishing from
 * unverified employers anyway (403 employer_not_verified); this just explains it first.
 *
 * It uses aria-disabled rather than disabled so keyboard and screen reader users can still reach it
 * and hear the explanation.
 */
export function PublishButton({
  to,
  onClick,
  fullWidth = true,
  children,
  className,
  ...rest
}: PublishButtonProps) {
  const access = useEmployerAccess()
  const reasonId = useId()

  if (!access.isPending && !access.isError && access.canPublish) {
    if (to) {
      return (
        <Link to={to} className={buttonClasses({ fullWidth, className })}>
          {children}
        </Link>
      )
    }
    return (
      <button
        type="button"
        onClick={onClick}
        className={buttonClasses({ fullWidth, className })}
        {...rest}
      >
        {children}
      </button>
    )
  }

  const reason = access.isPending
    ? 'Checking your company status…'
    : access.isError
      ? 'We could not check your company status. Reload the page to try again.'
      : publishBlockedReason(access.status)

  return (
    <div>
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={reasonId}
        onClick={(event) => event.preventDefault()}
        className={cn(
          buttonClasses({ fullWidth, className }),
          'cursor-not-allowed border-border bg-surface text-text-secondary hover:bg-surface',
        )}
        {...rest}
      >
        {children}
      </button>
      <p id={reasonId} className="mt-1.5 text-sm text-text-secondary">
        {reason}
        {!access.isPending && access.status !== 'pending' && access.status !== 'suspended' && (
          <>
            {' '}
            <Link to="/employer/profile" className="font-semibold underline">
              Go to company profile
            </Link>
          </>
        )}
      </p>
    </div>
  )
}
