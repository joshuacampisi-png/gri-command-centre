/**
 * Service worker — DISABLED caching of HTML + JS to prevent stale-bundle
 * lockouts. Previously: precached '/' on install and served stale HTML
 * to users even after hard refresh, leaving them stuck on old code.
 *
 * NEW STRATEGY (v3):
 *   - On install: skipWaiting → take over immediately
 *   - On activate: clean ALL old caches + claim all clients (forces every
 *     open tab to reload with the new SW)
 *   - On fetch: bypass cache entirely for HTML + JS + CSS. Only icons /
 *     fonts / images get cached.
 *
 * Cache busting on deploy: simply bump CACHE_NAME version below.
 */
const CACHE_NAME = 'command-centre-v3'

self.addEventListener('install', (event) => {
  // Take over immediately — don't wait for old SW to release
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Nuke every cache (including any old version of this SW's cache)
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      // Take control of every open tab IMMEDIATELY
      await self.clients.claim()
      // Tell every controlled page to reload so they pick up new HTML
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        client.postMessage({ type: 'SW_UPDATED', reload: true })
      }
    })()
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)

  // NEVER intercept API requests, signing URLs, or anything cross-origin
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/sign')) return
  if (url.pathname.startsWith('/checkout')) return

  // HTML + JS + CSS: ALWAYS network-fetch, never serve from cache.
  // Prevents stale-bundle lockouts.
  const path = url.pathname
  const isCodeAsset = path.endsWith('.html') || path === '/' || path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.json')

  if (isCodeAsset) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() =>
        // Only fall back to cache if network is completely down (offline)
        caches.match(event.request).then((cached) => cached || new Response('Offline', { status: 503 }))
      )
    )
    return
  }

  // Other static (icons, fonts, manifest) — cache-first is fine
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return res
      })
    })
  )
})
