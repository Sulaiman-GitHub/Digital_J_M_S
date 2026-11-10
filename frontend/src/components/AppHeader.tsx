import { useCallback, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { pictureUrl } from '../api/pictures'
import { useAuth } from '../features/auth/authContext'
import { usePicture } from '../features/pictures/usePicture'
import { cn } from '../lib/cn'
import { ROLE_LABELS } from '../lib/roles'
import { useDismiss } from '../lib/useDismiss'
import { buttonClasses } from './buttonStyles'
import { CompanyAvatar } from './CompanyAvatar'
import { ThemeToggle } from './ThemeToggle'
import { useToast } from './toastContext'

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex min-h-11 items-center font-medium whitespace-nowrap',
    isActive ? 'text-primary md:shadow-[inset_0_-2px_0_var(--color-primary)]' : 'text-text',
  )

const menuItemClasses =
  'flex min-h-11 w-full cursor-pointer items-center text-left text-text hover:bg-surface'

/**
 * Site header. Logged out: Log in and Register. Logged in: a user menu with Logout on desktop,
 * a menu button on phones. (Job seekers also get a bottom navigation on phones.)
 */
export function AppHeader() {
  const { user, status, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const headerRef = useRef<HTMLElement>(null)
  const userButtonRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Job seekers have a photo and employers a logo; the account button shows it when there is one.
  const pictureKind =
    user?.role === 'job_seeker' ? 'photo' : user?.role === 'employer' ? 'logo' : null
  const picture = usePicture(pictureKind ?? 'photo', pictureKind !== null)
  const avatarUrl =
    pictureKind && picture.data ? pictureUrl(pictureKind, picture.data.created_at) : null

  // Job seekers have the most links, so they get the short wordmark to keep the bar on one line.
  const compactBrand = user?.role === 'job_seeker'

  const closeMenus = useCallback(() => {
    // Return focus to the control that opened the menu.
    if (userMenuOpen) userButtonRef.current?.focus()
    if (mobileMenuOpen) menuButtonRef.current?.focus()
    setUserMenuOpen(false)
    setMobileMenuOpen(false)
  }, [userMenuOpen, mobileMenuOpen])
  useDismiss(userMenuOpen || mobileMenuOpen, closeMenus, headerRef)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
      setUserMenuOpen(false)
      setMobileMenuOpen(false)
      navigate('/')
    } catch {
      toast.show({
        message: 'Could not log you out. Check your connection and try again.',
        tone: 'error',
      })
    } finally {
      setLoggingOut(false)
    }
  }

  const closeOnNavigate = () => {
    setUserMenuOpen(false)
    setMobileMenuOpen(false)
  }

  return (
    <header ref={headerRef} className="relative border-b border-border bg-card shadow-sm">
      <div className="mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-2 px-4 md:min-h-16">
        <div className="flex items-center gap-5 lg:gap-8">
          <Link
            to="/"
            aria-label="Digital Job Matching System"
            className="inline-flex items-center gap-2 rounded-card py-2 text-lg font-bold text-text"
          >
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-card bg-linear-to-br from-hero-from to-hero-to text-sm font-extrabold text-white"
            >
              DJ
            </span>
            <span
              aria-hidden="true"
              className={cn('max-[399px]:hidden', !compactBrand && 'sm:hidden')}
            >
              DJM<span className="text-primary">S</span>
            </span>
            <span aria-hidden="true" className={cn('hidden', !compactBrand && 'sm:inline')}>
              Digital Job Matching <span className="text-primary">System</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-stretch gap-4 md:flex lg:gap-5">
            <NavLink to="/jobs" className={navLinkClasses}>
              Find jobs
            </NavLink>
            {user?.role === 'job_seeker' && (
              <>
                <NavLink to="/saved" className={navLinkClasses}>
                  Saved jobs
                </NavLink>
                <NavLink to="/applications" className={navLinkClasses}>
                  My applications
                </NavLink>
                <NavLink to="/profile" className={navLinkClasses}>
                  My profile
                </NavLink>
              </>
            )}
            {user?.role === 'employer' && (
              <NavLink to="/employer" className={navLinkClasses}>
                My company
              </NavLink>
            )}
            {user?.role === 'admin' && (
              <>
                <NavLink to="/admin/employers" className={navLinkClasses}>
                  Employers
                </NavLink>
                <NavLink to="/admin/reports" className={navLinkClasses}>
                  Reports
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {status !== 'loading' && !user && (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className={buttonClasses({ variant: 'ghost', className: 'px-3 sm:px-4' })}
              >
                Log in
              </Link>
              <Link
                to="/register"
                className={buttonClasses({ variant: 'secondary', className: 'px-3 sm:px-4' })}
              >
                Register
              </Link>
            </div>
          )}

          {user && (
            <>
              <button
                ref={userButtonRef}
                type="button"
                aria-expanded={userMenuOpen}
                aria-controls="user-menu"
                aria-label="Account menu"
                onClick={() => setUserMenuOpen((open) => !open)}
                className="hidden min-h-11 cursor-pointer items-center gap-2 rounded-card border border-border bg-card px-2 md:inline-flex"
              >
                {avatarUrl ? (
                  <CompanyAvatar
                    name={user.email}
                    imageUrl={avatarUrl}
                    round
                    className="size-7 text-sm"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-7 place-items-center rounded-pill bg-primary text-sm font-bold text-on-solid"
                  >
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="max-w-24 truncate lg:max-w-44">{user.email}</span>
                <span aria-hidden="true">▾</span>
              </button>
              <button
                ref={menuButtonRef}
                type="button"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                aria-label="Menu"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-card border border-border bg-card text-xl md:hidden"
              >
                <span aria-hidden="true">{mobileMenuOpen ? '✕' : '☰'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {user && userMenuOpen && (
        <div
          id="user-menu"
          className="absolute top-full right-4 z-20 hidden w-64 rounded-card border border-border bg-card py-2 shadow-lg md:block"
        >
          <p className="border-b border-border px-4 pb-3 text-sm">
            <strong className="block truncate">{user.email}</strong>
            <span className="text-text-secondary">
              {ROLE_LABELS[user.role]}
              {!user.email_verified && ' · email not verified'}
            </span>
          </p>
          {user.role === 'employer' && (
            <Link
              to="/employer/profile"
              onClick={closeOnNavigate}
              className={cn(menuItemClasses, 'px-4')}
            >
              Company profile
            </Link>
          )}
          <Link to="/account" onClick={closeOnNavigate} className={cn(menuItemClasses, 'px-4')}>
            My account
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className={cn(menuItemClasses, 'px-4 text-danger disabled:opacity-60')}
          >
            Log out
          </button>
        </div>
      )}

      {user && mobileMenuOpen && (
        <nav
          id="mobile-menu"
          aria-label="Menu"
          className="border-t border-border px-4 pt-2 pb-4 md:hidden"
        >
          <p className="py-2 text-sm text-text-secondary">
            {user.email} · {ROLE_LABELS[user.role]}
          </p>
          <Link to="/jobs" onClick={closeOnNavigate} className={menuItemClasses}>
            Find jobs
          </Link>
          {user.role === 'employer' && (
            <Link to="/employer" onClick={closeOnNavigate} className={menuItemClasses}>
              My company
            </Link>
          )}
          {user.role === 'admin' && (
            <>
              <Link to="/admin/employers" onClick={closeOnNavigate} className={menuItemClasses}>
                Employers
              </Link>
              <Link to="/admin/reports" onClick={closeOnNavigate} className={menuItemClasses}>
                Reports
              </Link>
            </>
          )}
          <Link to="/account" onClick={closeOnNavigate} className={menuItemClasses}>
            My account
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className={cn(menuItemClasses, 'text-danger disabled:opacity-60')}
          >
            Log out
          </button>
        </nav>
      )}
    </header>
  )
}
