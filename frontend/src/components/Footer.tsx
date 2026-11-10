import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/authContext'

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-sm font-bold tracking-wide text-text uppercase">{title}</h2>
      <ul className="mt-3 space-y-2 text-text-secondary">{children}</ul>
    </nav>
  )
}

const linkClass = 'inline-flex min-h-8 items-center hover:text-primary hover:underline'

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className={linkClass}>
        {children}
      </Link>
    </li>
  )
}

/** Site footer: what the system is, where to go next for each kind of user, and the legal pages. */
export function Footer() {
  const { user } = useAuth()
  const year = new Date().getFullYear()
  return (
    <footer className="mt-12 border-t border-border bg-card">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <Link to="/" className="inline-flex items-center gap-2 text-lg font-bold text-text">
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-card bg-linear-to-br from-hero-from to-hero-to text-sm font-extrabold text-white"
              >
                DJ
              </span>
              Digital Job Matching <span className="text-primary">System</span>
            </Link>
            <p className="max-w-xs text-text-secondary">
              Connecting students and graduates of every university and tertiary institution in
              Uganda with verified employers.
            </p>
          </div>

          <Column title="Job seekers">
            <FooterLink to="/jobs">Find jobs</FooterLink>
            {user?.role === 'job_seeker' ? (
              <>
                <FooterLink to="/profile">My profile</FooterLink>
                <FooterLink to="/saved">Saved jobs</FooterLink>
                <FooterLink to="/applications">My applications</FooterLink>
              </>
            ) : (
              !user && <FooterLink to="/register">Create a free account</FooterLink>
            )}
            <li>
              <Link to="/#how-it-works" className={linkClass}>
                How it works
              </Link>
            </li>
          </Column>

          <Column title="Employers">
            {user?.role === 'employer' ? (
              <>
                <FooterLink to="/employer">Dashboard</FooterLink>
                <FooterLink to="/employer/profile">Company profile</FooterLink>
                <FooterLink to="/employer/vacancies/new">Post a vacancy</FooterLink>
              </>
            ) : (
              !user && (
                <>
                  <FooterLink to="/register">Register your company</FooterLink>
                  <FooterLink to="/login?as=employer">Employer log in</FooterLink>
                </>
              )
            )}
            <li>
              <Link to="/#for-employers" className={linkClass}>
                Why hire here
              </Link>
            </li>
            {user?.role === 'admin' && (
              <FooterLink to="/admin/employers">Review employers</FooterLink>
            )}
          </Column>

          <Column title="Help and legal">
            <li>
              <Link to="/#faq" className={linkClass}>
                Questions and answers
              </Link>
            </li>
            <FooterLink to="/privacy">Privacy Policy</FooterLink>
            <FooterLink to="/terms">Terms of Use</FooterLink>
            {!user && <FooterLink to="/login">Log in</FooterLink>}
          </Column>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-5 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Digital Job Matching System. Made in Uganda.</p>
          <a href="#top" className="font-semibold text-primary hover:underline">
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  )
}
