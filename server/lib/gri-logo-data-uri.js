/**
 * gri-logo-data-uri.js
 * ─────────────────────────────────────────────────────────────
 * Loads the GRI logo once at startup and exports it as a
 * base64 data URI. Used by the customer contract signing page
 * so the logo ALWAYS renders, even if:
 *  - the dashboard password is active
 *  - Shopify CDN is down
 *  - Railway static assets are misconfigured
 *  - the customer's email client is a strict preview sandbox
 *
 * Zero network dependency = zero failure modes.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

let cached = null

export function getGriLogoDataUri() {
  if (cached) return cached
  try {
    const p = join(__dirname, '..', '..', 'public', 'company-logos', 'gri.jpg')
    const buf = readFileSync(p)
    cached = `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    // Fallback: public Shopify CDN URL (always publicly reachable)
    cached = 'https://genderrevealideas.com.au/cdn/shop/files/GRI_Logo_Horizontal_Transparent_v2.png?v=1704592121&width=460'
  }
  return cached
}
