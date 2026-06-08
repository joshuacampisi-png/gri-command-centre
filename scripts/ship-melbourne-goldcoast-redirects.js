/**
 * SHIP: 301 redirects from old broken duplicate Melbourne + Gold Coast collections
 *       to canonical /gender-reveal-ideas-[city] pages
 *
 * Old pages are showing "Something went wrong" titles, 792 words, 0 schemas.
 * New pages are 16k words, 6 schemas — but old has historical authority.
 * 301 redirect transfers authority to new canonical.
 *
 * Rollback: node scripts/ship-melbourne-goldcoast-redirects.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const API = `https://${SHOP}/admin/api/2026-01`

const SNAPSHOT_DIR = 'data/snapshots/melbourne-goldcoast-redirects'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const ROLLBACK = process.argv.includes('--rollback')

const REDIRECTS = [
  // Melbourne consolidation
  { from: '/collections/gender-reveal-balloons-melbourne',     to: '/collections/gender-reveal-ideas-melbourne' },
  { from: '/collections/gender-reveal-cannons-nbsp-melbourne', to: '/collections/gender-reveal-ideas-melbourne' },
  // Gold Coast consolidation
  { from: '/collections/gender-reveal-cannons-gold-coast',     to: '/collections/gender-reveal-ideas-gold-coast' },
  { from: '/collections/gender-reveal-balloons-gold-coast',    to: '/collections/gender-reveal-ideas-gold-coast' },
]

async function shopFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers||{}) },
  })
  return { status: r.status, json: r.status === 204 ? {} : await r.json().catch(()=>({})) }
}

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — Melbourne + Gold Coast canonical redirects ===\n`)

// ── ROLLBACK ──
if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG,'utf8'))
  for (const id of log.createdRedirectIds||[]) {
    const r = await shopFetch(`/redirects/${id}.json`, { method: 'DELETE' })
    console.log(`  ${r.status===200||r.status===204?'✓ deleted':'⚠ '+r.status} redirect ${id}`)
  }
  process.exit(0)
}

const audit = { shippedAt: new Date().toISOString(), createdRedirectIds: [], created: [], skipped: [], errors: [] }

for (const R of REDIRECTS) {
  // Check if redirect already exists
  const existing = await shopFetch(`/redirects.json?path=${encodeURIComponent(R.from)}`)
  if (existing.json?.redirects?.length) {
    const e = existing.json.redirects[0]
    console.log(`  ⊘ skip "${R.from}" — redirect already exists (id ${e.id}, → ${e.target})`)
    audit.skipped.push({ ...R, existingId: e.id, existingTarget: e.target })
    continue
  }

  // Create the redirect
  const create = await shopFetch('/redirects.json', {
    method: 'POST',
    body: JSON.stringify({ redirect: { path: R.from, target: R.to } }),
  })
  if (create.json?.redirect?.id) {
    console.log(`  ✓ created  ${R.from}  →  ${R.to}  (id ${create.json.redirect.id})`)
    audit.createdRedirectIds.push(create.json.redirect.id)
    audit.created.push({ ...R, id: create.json.redirect.id })
  } else {
    console.log(`  ✗ FAILED  ${R.from}  → ${R.to}  status:${create.status}  ${JSON.stringify(create.json).slice(0,200)}`)
    audit.errors.push({ ...R, status: create.status, response: create.json })
  }
  await new Promise(r => setTimeout(r, 300))
}

writeFileSync(LOG, JSON.stringify(audit, null, 2))
console.log(`\n✓ Snapshot saved: ${LOG}`)
console.log(`Rollback: node scripts/ship-melbourne-goldcoast-redirects.js --rollback\n`)

console.log(`Summary:`)
console.log(`  Created:  ${audit.created.length}`)
console.log(`  Skipped:  ${audit.skipped.length}`)
console.log(`  Errors:   ${audit.errors.length}`)

console.log(`\n--- VERIFY (live HEAD checks) ---`)
for (const R of REDIRECTS) {
  try {
    const r = await fetch(`https://genderrevealideas.com.au${R.from}`, { method: 'HEAD', redirect: 'manual' })
    const loc = r.headers.get('location') || ''
    const ok = r.status === 301 || r.status === 302
    console.log(`  ${ok?'✓':'⚠'} ${R.from}  HTTP ${r.status}  →  ${loc.replace('https://genderrevealideas.com.au','') || '(no Location header)'}`)
  } catch(e) { console.log(`  ⚠ ${R.from} — fetch error: ${e.message}`) }
}

process.exit(0)
