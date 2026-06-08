/**
 * SHIP: UGC Video carousel product mappings
 *  1. Apply 2 confirmed corrections to index.json
 *  2. Copy resulting 19 mappings to index.context.au.json (currently all empty)
 *
 * Rollback: node scripts/ship-ugc-video-mappings.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const THEME = '163830661209'

const SNAPSHOT_DIR = 'data/snapshots/ugc-video-mappings'
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

console.log(`\n=== ${ROLLBACK ? 'ROLLBACK' : 'SHIP'} — UGC Video Mappings ===\n`)

if (ROLLBACK) {
  if (!existsSync(BACKUP_INDEX) || !existsSync(BACKUP_AU)) { console.error('No backups'); process.exit(1) }
  const idxR = await putAsset('templates/index.json', readFileSync(BACKUP_INDEX, 'utf8'))
  console.log(idxR.status === 200 ? '✓ index.json restored' : '✗ failed')
  const auR = await putAsset('templates/index.context.au.json', readFileSync(BACKUP_AU, 'utf8'))
  console.log(auR.status === 200 ? '✓ index.context.au.json restored' : '✗ failed')
  process.exit(0)
}

// 1. Pull both templates
const indexRaw = await getAsset('templates/index.json')
const auRaw = await getAsset('templates/index.context.au.json')
writeFileSync(BACKUP_INDEX, indexRaw)
writeFileSync(BACKUP_AU, auRaw)
console.log(`✓ backed up originals`)

const indexJson = JSON.parse(indexRaw)
const auJson = JSON.parse(auRaw)

const indexSec = indexJson.sections?.video_carousel_6HwtRR
const auSec = auJson.sections?.video_carousel_mLy6a9

if (!indexSec || !auSec) { console.error('Sections not found'); process.exit(1) }

// 2. Apply 2 confirmed corrections to index.json
const CORRECTIONS = [
  { blockIdHint: 'tnt 26.11', newProduct: 'tnt-gender-reveal-australia',     reason: 'TNT video was linked to soccer ball' },
  { blockIdHint: 'Soph Mini Blaster', newProduct: 'gender-reveal-extinguisher-australia', reason: 'Mini Blaster handle typo (had extra s)' },
]

const indexBlocks = indexSec.blocks || {}
const auBlocks = auSec.blocks || {}
const indexOrder = indexSec.block_order || []
const auOrder = auSec.block_order || []

const audit = { shippedAt: new Date().toISOString(), changes: { indexJson: [], auJson: [] } }

console.log('--- 2 corrections in index.json ---')
for (const fix of CORRECTIONS) {
  let found = false
  for (const bid of indexOrder) {
    const b = indexBlocks[bid]
    if (!b) continue
    const filename = (b.settings?.html5_video || '').toLowerCase()
    if (filename.includes(fix.blockIdHint.toLowerCase())) {
      const old = b.settings?.product || ''
      b.settings.product = fix.newProduct
      audit.changes.indexJson.push({ blockId: bid, filename, oldProduct: old, newProduct: fix.newProduct, reason: fix.reason })
      console.log(`  ✓ ${bid} (${filename.split('/').pop()})`)
      console.log(`    ${old} → ${fix.newProduct}`)
      console.log(`    reason: ${fix.reason}`)
      found = true
      break
    }
  }
  if (!found) console.log(`  ⚠ "${fix.blockIdHint}" — not found`)
}

// 3. Copy index.json mappings to au.json (by ORDER position, since block IDs differ)
console.log('\n--- Copy 19 mappings to index.context.au.json (positional) ---')
const indexProducts = indexOrder.map(bid => indexBlocks[bid]?.settings?.product || '')
const auBlockIds = auOrder.filter(bid => auBlocks[bid])

if (indexProducts.length !== auBlockIds.length) {
  console.log(`  ⚠ Mismatch: index has ${indexProducts.length} blocks, AU has ${auBlockIds.length}`)
  console.log(`  Proceeding with min of the two (${Math.min(indexProducts.length, auBlockIds.length)})`)
}

const limit = Math.min(indexProducts.length, auBlockIds.length)
let copied = 0
for (let i = 0; i < limit; i++) {
  const auBid = auBlockIds[i]
  const auBlock = auBlocks[auBid]
  const newProduct = indexProducts[i]
  if (!newProduct) continue
  const old = auBlock.settings?.product || ''
  if (old === newProduct) continue
  auBlock.settings.product = newProduct
  audit.changes.auJson.push({ position: i + 1, blockId: auBid, oldProduct: old, newProduct })
  copied++
}
console.log(`  ✓ ${copied} AU blocks updated with product mappings`)

// 4. Push both
console.log('\n--- Pushing updates ---')
const idxOut = JSON.stringify(indexJson, null, 2)
const idxR = await putAsset('templates/index.json', idxOut)
console.log(`  index.json:               status ${idxR.status}`)
const auOut = JSON.stringify(auJson, null, 2)
const auR = await putAsset('templates/index.context.au.json', auOut)
console.log(`  index.context.au.json:    status ${auR.status}`)

writeFileSync(LOG, JSON.stringify(audit, null, 2))
console.log(`\n━━━ SHIPPED ${new Date().toISOString()} ━━━`)
console.log(`Snapshot: ${LOG}`)
console.log(`Rollback: node scripts/ship-ugc-video-mappings.js --rollback`)
process.exit(0)
