/**
 * Swap BADGE_IMG to also use the new "Google 2026 BEST" circular logo
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const log = JSON.parse(readFileSync('data/snapshots/google-trust-badge/log.json','utf8'))
const themeId = log.themeId
const newUrl  = log.popupLogoUrl   // the 2026 BEST logo we just uploaded

// Pull current JS
const cur = await rest(`/themes/${themeId}/assets.json?asset[key]=assets/gri-google-trust-badge.js`)
let js = cur.asset?.value
if (!js) { console.error('Could not read JS asset'); process.exit(1) }

// Replace BADGE_IMG value (string literal) — Shopify minifies but the var declaration is intact
js = js.replace(/BADGE_IMG="[^"]+"/, `BADGE_IMG=${JSON.stringify(newUrl)}`)
js = js.replace(/var BADGE_IMG = "[^"]+";/, `var BADGE_IMG = ${JSON.stringify(newUrl)};`)

// Push
const r = await rest(`/themes/${themeId}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({ asset: { key: 'assets/gri-google-trust-badge.js', value: js } })
})
if (r.errors) { console.error(r.errors); process.exit(1) }
console.log('✓ Badge image now uses the 2026 BEST logo')
console.log(`Asset: ${r.asset?.public_url || r.asset?.key}`)
process.exit(0)
