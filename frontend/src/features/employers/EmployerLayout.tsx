import { Outlet } from 'react-router-dom'
import { VerificationBanner } from './VerificationBanner'

/**
 * Wraps every employer page. The route guard already limits it to employers; the banner shows the
 * verification status above the page, whichever employer page is open.
 */
export function EmployerLayout() {
  return (
    <>
      <div className="-mx-4 -mt-6 mb-6 sm:mx-0 sm:mt-0">
        <VerificationBanner />
      </div>
      <Outlet />
    </>
  )
}
