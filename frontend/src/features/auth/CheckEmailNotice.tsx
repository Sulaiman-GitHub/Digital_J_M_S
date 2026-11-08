import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { buttonClasses } from '../../components/buttonStyles'
import { AuthShell } from './AuthShell'

export interface CheckEmailNoticeProps {
  title?: string
  children: ReactNode
  hint?: string
}

/** The "Check your email" screen shown after registering and after "forgot password". */
export function CheckEmailNotice({
  title = 'Check your email',
  children,
  hint = 'No email after a few minutes? Check your spam folder.',
}: CheckEmailNoticeProps) {
  return (
    <AuthShell title={title} centered>
      <div
        aria-hidden="true"
        className="mx-auto grid size-14 place-items-center rounded-pill bg-primary-tint text-2xl text-primary"
      >
        ✉
      </div>
      <p className="text-text-secondary">{children}</p>
      <Link to="/login" className={buttonClasses({ fullWidth: true })}>
        Continue to log in
      </Link>
      <p className="text-sm text-text-secondary">{hint}</p>
    </AuthShell>
  )
}
