// Registers /sw.js so the app can be installed. Skipped in development: a service worker there
// would serve stale files while editing.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is a bonus; the site works without it.
    })
  })
}
