import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ForgetDeletedSession } from '../features/auth/ForgetDeletedSession'
import { useAuth } from '../features/auth/authContext'
import { cn } from '../lib/cn'
import { AppHeader } from './AppHeader'
import { BottomNav } from './BottomNav'
import { Footer } from './Footer'
import { VerifyEmailBanner } from './VerifyEmailBanner'

export function AppLayout() {
  const { user } = useAuth()
  const { hash, pathname } = useLocation()
  // Links like /#faq scroll to the section once the page has rendered.
  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(hash.slice(1))
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [hash, pathname])
  // Job seekers get a bottom navigation on phones; leave room so it never covers content.
  const showBottomNav = user?.role === 'job_seeker'

  return (
    <div id="top" className="min-h-svh bg-surface text-text">
      <ForgetDeletedSession />
      <AppHeader />
      <VerifyEmailBanner />
      <main className={cn('mx-auto max-w-5xl px-4 py-6', showBottomNav && 'pb-24 md:pb-6')}>
        <Outlet />
      </main>
      <div className={cn(showBottomNav && 'pb-14 md:pb-0')}>
        <Footer />
      </div>
      {showBottomNav && <BottomNav />}
    </div>
  )
}
