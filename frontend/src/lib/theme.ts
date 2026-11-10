import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'djm-theme'
const listeners = new Set<() => void>()

function current(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private mode or blocked storage: the choice just lasts until the page is closed.
  }
  listeners.forEach((listener) => listener())
}

/** The current theme and a function to flip it. The first value was applied before first paint. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as Theme)
  const toggle = useCallback(() => setTheme(current() === 'dark' ? 'light' : 'dark'), [])
  return { theme, toggle }
}
