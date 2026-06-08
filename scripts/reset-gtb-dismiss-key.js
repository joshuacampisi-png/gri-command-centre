/**
 * Bump DISMISS_KEY version so any browser that previously dismissed
 * the badge gets it back on next page load
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const log = JSON.parse(readFileSync('data/snapshots/google-trust-badge/log.json','utf8'))
const themeId = log.themeId
const cur = await rest(`/themes/${themeId}/assets.json?asset[key]=assets/gri-google-trust-badge.js`)
let js = cur.asset?.value
if (!js) { console.error('JS not found'); process.exit(1) }

// Find next version
const m = js.match(/DISMISS_KEY="gri_gtb_dismissed_v(\d+)"/)
const cur_v = m ? parseInt(m[1]) : 1
const next_v = cur_v + 1
js = js.replace(/DISMISS_KEY="gri_gtb_dismissed_v\d+"/, `DISMISS_KEY="gri_gtb_dismissed_v${next_v}"`)
js = js.replace(/var DISMISS_KEY = 'gri_gtb_dismissed_v\d+';/, `var DISMISS_KEY = 'gri_gtb_dismissed_v${next_v}';`)

const r = await rest(`/themes/${themeId}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({ asset: { key: 'assets/gri-google-trust-badge.js', value: js } })
})
if (r.errors) { console.error(r.errors); process.exit(1) }
console.log(`✓ DISMISS_KEY bumped: v${cur_v} → v${next_v}`)
console.log(`Asset: ${r.asset?.public_url || r.asset?.key}`)
process.exit(0)
