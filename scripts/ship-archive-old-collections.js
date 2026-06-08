/**
 * Rename old broken duplicate collections to _archive-* handles
 * This frees up the canonical URLs so our pre-created 301 redirects fire.
 *
 * The old collections still exist (with their products) at the new _archive-* handle.
 * Just the URL is freed up for redirect to take over.
 *
 * Rollback: node scripts/ship-archive-old-collections.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const API = `https://${SHOP}/admin/api/2026-01`

const SNAPSHOT_DIR = 'data/snapshots/archive-old-collections'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const ROLLBACK = process.argv.includes('--rollback')

const TARGETS = [
  { type: 'smart_collections',  id: 278665855065, oldHandle: 'gender-reveal-balloons-melbourne',     newHandle: '_archive-balloons-melbourne',     canonical: '/collections/gender-reveal-ideas-melbourne' },
  { type: 'custom_collections', id: 278665101401, oldHandle: 'gender-reveal-cannons-nbsp-melbourne', newHandle: '_archive-cannons-melbourne',      canonical: '/collections/gender-reveal-ideas-melbourne' },
  { type: 'custom_collections', id: 278144417881, oldHandle: 'gender-reveal-cannons-gold-coast',     newHandle: '_archive-cannons-gold-coast',     canonical: '/collections/gender-reveal-ideas-gold-coast' },
  { type: 'smart_collections',  id: 278144516185, oldHandle: 'gender-reveal-balloons-gold-coast',    newHandle: '_archive-balloons-gold-coast',    canonical: '/collections/gender-reveal-ideas-gold-coast' },
]

async function shopFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers||{}) },
  })
  return { status: r.status, json: r.status === 204 ? {} : await r.json().catch(()=>({})) }
}

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — Archive duplicate Melbourne + Gold Coast collections ===\n`)

if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG,'utf8'))
  for (const T of log.renamed||[]) {
    const key = T.type === 'smart_collections' ? 'smart_collection' : 'custom_collection'
    const r = await shopFetch(`/${T.type}/${T.id}.json`, {
      method: 'PUT',
      body: JSON.stringify({ [key]: { id: T.id, handle: T.oldHandle } }),
    })
    console.log(`  ${r.status===200?'✓':'⚠ '+r.status} restored ${T.id} → /${T.oldHandle}`)
  }
  process.exit(0)
}

const audit = { shippedAt: new Date().toISOString(), renamed: [], autoRedirectsDeleted: [], errors: [] }

for (const T of TARGETS) {
  console.log(`\n--- ${T.oldHandle} ---`)
  const key = T.type === 'smart_collections' ? 'smart_collection' : 'custom_collection'

  // Rename
  const r = await shopFetch(`/${T.type}/${T.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ [key]: { id: T.id, handle: T.newHandle } }),
  })
  if (r.status === 200) {
    console.log(`  ✓ renamed handle  /${T.oldHandle}  →  /${T.newHandle}`)
    audit.renamed.push(T)
  } else {
    console.log(`  ✗ rename failed status:${r.status}  ${JSON.stringify(r.json).slice(0,200)}`)
    audit.errors.push({ target: T, status: r.status, response: r.json })
    continue
  }

  await new Promise(r => setTimeout(r, 800))

  // Shopify may auto-create a redirect old→new; delete that auto-redirect since we want old→canonical
  // Our pre-existing redirect (created earlier) should remain intact
  const checkR = await shopFetch(`/redirects.json?path=/collections/${T.oldHandle}`)
  const redirects = checkR.json?.redirects || []
  console.log(`  ${redirects.length} redirect(s) exist for /collections/${T.oldHandle}`)
  for (const rd of redirects) {
    console.log(`    id ${rd.id}  →  ${rd.target}`)
    if (rd.target === `/collections/${T.newHandle}`) {
      // This is Shopify's auto-created one — delete it
      const del = await shopFetch(`/redirects/${rd.id}.json`, { method: 'DELETE' })
      console.log(`      ${del.status===200||del.status===204?'✓ deleted (was auto-created by Shopify)':'⚠ '+del.status}`)
      audit.autoRedirectsDeleted.push({ id: rd.id, was: rd })
    } else if (rd.target === T.canonical) {
      console.log(`      ✓ kept (canonical redirect to ${T.canonical})`)
    } else {
      console.log(`      ⚠ unknown target — leaving in place`)
    }
  }

  // Reaffirm our canonical redirect
  const reAffirm = await shopFetch(`/redirects.json?path=/collections/${T.oldHandle}`)
  const remaining = reAffirm.json?.redirects || []
  const hasCanonical = remaining.some(r => r.target === T.canonical)
  if (!hasCanonical) {
    console.log(`  ⚠ canonical redirect missing — re-creating...`)
    const re = await shopFetch('/redirects.json', {
      method: 'POST',
      body: JSON.stringify({ redirect: { path: `/collections/${T.oldHandle}`, target: T.canonical } }),
    })
    console.log(`  ${re.json?.redirect?.id ? '✓ re-created' : '✗ failed'}`)
  }
}

writeFileSync(LOG, JSON.stringify(audit, null, 2))
console.log(`\n✓ Snapshot saved: ${LOG}`)
console.log(`Rollback: node scripts/ship-archive-old-collections.js --rollback\n`)

// Verify
console.log(`--- VERIFY (live HEAD checks) ---`)
for (const T of TARGETS) {
  try {
    const r = await fetch(`https://genderrevealideas.com.au/collections/${T.oldHandle}`, { method: 'HEAD', redirect: 'manual' })
    const loc = r.headers.get('location') || ''
    const ok = (r.status === 301 || r.status === 302) && loc.includes(T.canonical)
    console.log(`  ${ok?'✓':'⚠'} /collections/${T.oldHandle}  HTTP ${r.status}  →  ${loc.replace('https://genderrevealideas.com.au','') || '(no Location)'}`)
  } catch(e) { console.log(`  ⚠ /collections/${T.oldHandle} — ${e.message}`) }
}

console.log(`\nSummary:`)
console.log(`  Renamed:                ${audit.renamed.length}`)
console.log(`  Auto-redirects deleted: ${audit.autoRedirectsDeleted.length}`)
console.log(`  Errors:                 ${audit.errors.length}`)
process.exit(0)
