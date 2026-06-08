/**
 * SHIP: Fix UGC video #1 (and similar) using GID format
 * Target: gender-reveal-powder-cannons-extinguisher (ID 7877241602137)
 *         = Gender Reveal Cannon & Extinguisher Double Bundle 🎉
 *
 * Apply to positions 1, 15, 17, 18, 19 (all currently rendering as wrong product)
 *
 * Rollback: node scripts/ship-ugc-fix-with-gid.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const THEME = '163830661209'

const SNAPSHOT_DIR = 'data/snapshots/ugc-fix-gid'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`
const BACKUP_INDEX = `${SNAPSHOT_DIR}/index.original.json`
const BACKUP_AU = `${SNAPSHOT_DIR}/index.context.au.original.json`
const ROLLBACK = process.argv.includes('--rollback')

async function getAsset(key) {
  const r = await fetch(`https://${SHOP}/admin/api/2026-01/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`, { headers: { 'X-Shopify-Access-Token': TOKEN } })
  return (await r.json()).asset?.value || ''
}
async function putAsset(key, value) {
  const r = await fetch(`https://${SHOP}/admin/api/2026-01/themes/${THEME}/assets.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } }),
  })
  return { status: r.status, json: await r.json().catch(()=>({})) }
}

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — UGC fix with GID format ===\n`)

if (ROLLBACK) {
  if (existsSync(BACKUP_INDEX)) await putAsset('templates/index.json', readFileSync(BACKUP_INDEX,'utf8'))
  if (existsSync(BACKUP_AU)) await putAsset('templates/index.context.au.json', readFileSync(BACKUP_AU,'utf8'))
  console.log('✓ rolled back')
  process.exit(0)
}

// Target — Cannon & Extinguisher Double Bundle product
// Note: trying multiple formats to find which Shopify accepts
const TARGET_HANDLE = 'gender-reveal-powder-cannons-extinguisher'
const TARGET_GID    = 'gid://shopify/Product/7877241602137'

// Positions (1-indexed) showing "Gender Reveal Cannon &..." title that should link to bundle
const TARGET_POSITIONS = [1, 15, 17, 18, 19]

for (const tplKey of ['templates/index.json', 'templates/index.context.au.json']) {
  console.log(`\n--- ${tplKey} ---`)
  const raw = await getAsset(tplKey)
  // Backup
  if (tplKey.includes('au')) writeFileSync(BACKUP_AU, raw)
  else writeFileSync(BACKUP_INDEX, raw)

  const j = JSON.parse(raw)
  const secKey = Object.keys(j.sections||{}).find(k => /video.carousel/i.test(j.sections[k]?.type||''))
  if (!secKey) { console.log('  no video carousel'); continue }
  const sec = j.sections[secKey]
  const order = sec.block_order || []
  const blocks = sec.blocks || {}

  for (const pos of TARGET_POSITIONS) {
    const bid = order[pos - 1]
    if (!bid) { console.log(`  position ${pos}: no block`); continue }
    const b = blocks[bid]
    if (!b) continue
    const old = b.settings?.product || ''
    // Use GID — Shopify's canonical product reference format
    b.settings.product = TARGET_GID
    console.log(`  pos ${pos} (${bid}): ${old} → ${TARGET_GID}`)
  }

  const out = JSON.stringify(j, null, 2)
  const r = await putAsset(tplKey, out)
  console.log(`  push status: ${r.status}`)
}

writeFileSync(LOG, JSON.stringify({ shippedAt: new Date().toISOString(), format: 'GID', target: TARGET_GID, positions: TARGET_POSITIONS }, null, 2))
console.log(`\n━━━ SHIPPED ━━━`)
console.log(`Snapshot: ${LOG}`)
console.log(`Rollback: node scripts/ship-ugc-fix-with-gid.js --rollback`)
console.log(`\nWait 30-60 seconds for Shopify CDN to clear, then test in incognito.`)
process.exit(0)
