// Installable app + offline support. The service worker (public/sw.js) is only registered in the production build —
// during `npm run dev` Vite's hot-reload would fight with it.

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* private mode / blocked — the app just works online-only */ })
  })
}

/** Forget the cached read-only API answers (menu, staff list…). Called when somebody signs out or in. */
export function clearApiCache() {
  try { navigator.serviceWorker?.controller?.postMessage('clear-api') } catch { /* no service worker */ }
}
