/* Hospitality ERP — service worker.
 * Goal: the POS screen still opens and works when the internet drops.
 *  - app files (hashed /assets/*, icons, fonts) : cache-first
 *  - page navigations                           : network-first, falls back to the cached app shell
 *  - a short allow-list of read-only API calls
 *    (menu, tables, staff list, accounts, …)    : network-first, falls back to the last good answer
 * Everything else (orders, payments, logins …) always goes to the server — never cached, never replayed
 * here; the POS keeps its own outbox for orders taken offline.
 * Cached API answers are wiped on sign-out / sign-in (see utils/pwa.ts → 'clear-api').
 */
const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`
const API = `api-${VERSION}`

const API_ALLOW = [
  /^\/api\/auth\/me$/, /^\/api\/auth\/my-permissions$/,
  /^\/api\/restaurant\/menu\/(items|categories)$/, /^\/api\/restaurant\/tables$/,
  /^\/api\/restaurant\/pos\/(staff|in-house)$/, /^\/api\/restaurant\/approvals\/policy$/,
  /^\/api\/system\/organization$/, /^\/api\/system\/modules$/,
  /^\/api\/hotel\/guests$/, /^\/api\/accounting\/accounts$/,
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS, API])
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('message', (e) => {
  if (e.data === 'clear-api') e.waitUntil(caches.delete(API))
})

const networkFirst = async (req, cacheName, fallbackKey) => {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(fallbackKey ?? req, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(fallbackKey ?? req)
    if (hit) return hit
    throw err
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return        // Google Fonts etc. are left to the browser

  // page loads → the SPA shell
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok) (await caches.open(SHELL)).put('/', res.clone())
        return res
      } catch {
        return (await caches.match('/')) ?? Response.error()
      }
    })())
    return
  }

  // built files: names contain a content hash, so cache-first is safe
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) cache.put(req, res.clone())
      return res
    })())
    return
  }

  // uploaded pictures (dish photos, logo) — show the last copy when offline
  if (url.pathname.startsWith('/uploads/')) {
    e.respondWith(networkFirst(req, ASSETS))
    return
  }

  if (url.pathname.startsWith('/api/') && API_ALLOW.some(r => r.test(url.pathname))) {
    // the answer depends on who is signed in → key by path only, but caches are wiped when the user changes
    e.respondWith(networkFirst(req, API, url.origin + url.pathname))
  }
})
