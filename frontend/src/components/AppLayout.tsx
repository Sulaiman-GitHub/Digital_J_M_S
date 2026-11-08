import { Outlet } from 'react-router-dom'
import { ForgetDeletedSession } from '../features/auth/ForgetDeletedSession'
import { useAuth } from '../features/auth/authContext'
import { cn } from '../lib/cn'
import { AppHeader } from './AppHeader'
import { BottomNav } from './BottomNav'
import { VerifyEmailBanner } from './VerifyEmailBanner'

export function AppLayout() {
  const { user } = useAuth()
  // Job seekers get a bottom navigation on phones; leave room so it never covers content.
  const showBottomNav = user?.role === 'job_seeker'

  return (
    <div className="min-h-svh bg-surface text-text">
      <ForgetDeletedSession />
      <AppHeader />
      <VerifyEmailBanner />
      <main className={cn('mx-auto max-w-5xl px-4 py-6', showBottomNav && 'pb-24 md:pb-6')}>
        <Outlet />
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  )
}
