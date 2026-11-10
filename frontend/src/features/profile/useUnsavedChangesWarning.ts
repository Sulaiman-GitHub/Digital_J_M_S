import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

function inScope(pathname: string, scope: string) {
  return pathname === scope || pathname.startsWith(`${scope}/`)
}

/**
 * Warn before leaving a page with unsaved changes: a blocker for in-app navigation (the page
 * shows a dialog) and the browser's own prompt for reload, close and typed addresses.
 */
export function useUnsavedChangesWarning(dirty: boolean, scope?: string) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      currentLocation.pathname !== nextLocation.pathname &&
      // Moving between pages inside `scope` keeps the same form, so nothing is lost.
      !(
        scope &&
        inScope(currentLocation.pathname, scope) &&
        inScope(nextLocation.pathname, scope)
      ),
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return blocker
}
