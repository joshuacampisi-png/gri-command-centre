import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register service worker for PWA. On any SW update (including the cache-
// killer v3 SW), reload the page so users instantly move to the new bundle
// instead of being stuck on a stale cached version.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Check for updates every 60 seconds
      setInterval(() => reg.update().catch(() => {}), 60_000)
      // When a new SW takes control, reload once so the user picks up new HTML
      let reloaded = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return
        reloaded = true
        window.location.reload()
      })
    }).catch(() => {})
    // Also listen for the explicit SW_UPDATED message from the new SW's activate handler
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'SW_UPDATED' && e.data?.reload) {
        window.location.reload()
      }
    })
  })
}
