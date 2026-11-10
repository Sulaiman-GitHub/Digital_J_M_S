import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'

const icons = {
  jobs: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  saved: <path d="M6 3h12v18l-6-4.5L6 21V3Z" />,
  applications: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  account: <path d="M4 6h16M4 12h16M4 18h16" />,
} as const

const items = [
  { to: '/jobs', label: 'Jobs', icon: icons.jobs, end: false },
  { to: '/saved', label: 'Saved', icon: icons.saved, end: false },
  { to: '/applications', label: 'Applications', icon: icons.applications, end: false },
  { to: '/profile', label: 'Profile', icon: icons.profile, end: false },
  { to: '/account', label: 'Account', icon: icons.account, end: false },
] as const

/** Job seeker navigation on phones (hidden from md up, where the header carries the links). */
export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card md:hidden"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold',
              isActive
                ? 'text-primary shadow-[inset_0_3px_0_var(--color-primary)]'
                : 'text-text-secondary',
            )
          }
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            className="size-5.5"
          >
            {item.icon}
          </svg>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
