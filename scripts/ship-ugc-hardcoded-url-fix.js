/**
 * SHIP: Fix the HARDCODED URLs in sections/video-carousel.liquid
 *
 * The section bypasses Liquid and uses a hardcoded JS PRODUCTS array.
 * Lines 688, 702, 704, 705, 706 all have:
 *   - Title: "Gender Reveal Cannon & Extinguisher Double Bundle"
 *   - URL/handle: gender-reveal-powder-cannons  ← WRONG (that's 2 Pack Powder XL Cannon)
 *
 * Should be: gender-reveal-powder-cannons-extinguisher (the actual Cannon & Extinguisher Bundle)
 *
 * Rollback: node scripts/ship-ugc-hardcoded-url-fix.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const THEME = '163830661209'
const ASSET = 'sections/video-carousel.liquid'

const SNAPSHOT_DIR = 'data/snapshots/ugc-hardcoded-fix'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`
const BACKUP = `${SNAPSHOT_DIR}/video-carousel.original.liquid`
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
  return { status: r.status }
}

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — UGC hardcoded URL fix ===\n`)

if (ROLLBACK) {
  if (!existsSync(BACKUP)) { console.error('No backup'); process.exit(1) }
  const r = await putAsset(ASSET, readFileSync(BACKUP, 'utf8'))
  console.log(r.status === 200 ? '✓ rolled back' : '✗ failed')
  process.exit(0)
}

// 1. Pull current section
const current = await getAsset(ASSET)
writeFileSync(BACKUP, current)
console.log(`✓ backed up to ${BACKUP} (${current.length} chars)`)

// 2. The fix: replace entries where TITLE is "Cannon & Extinguisher Double Bundle"
// but URL is wrong. Use exact string replace to be safe.
//
// Pattern to fix (appears 5 times):
//   {h:'gender-reveal-powder-cannons',t:'Gender Reveal Cannon & Extinguisher Double Bundle',...,url:'/products/gender-reveal-powder-cannons'}
//
// Replace WITH:
//   {h:'gender-reveal-powder-cannons-extinguisher',...,url:'/products/gender-reveal-powder-cannons-extinguisher'}

const WRONG_HANDLE = `h:'gender-reveal-powder-cannons',t:'Gender Reveal Cannon & Extinguisher Double Bundle'`
const RIGHT_HANDLE = `h:'gender-reveal-powder-cannons-extinguisher',t:'Gender Reveal Cannon & Extinguisher Double Bundle'`

const WRONG_URL = `url:'/products/gender-reveal-powder-cannons'`
const RIGHT_URL = `url:'/products/gender-reveal-powder-cannons-extinguisher'`

// First count occurrences before
const beforeHandleCount = (current.match(new RegExp(WRONG_HANDLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
console.log(`Found ${beforeHandleCount} entries with wrong handle + Bundle title`)

// Do the replace — replace ONLY entries where the handle is wrong AND the title is Bundle (not other entries that legitimately use this handle for the 2-Pack Powder Cannon)
// Since the URL is on the same line as the handle, we can be safe by chaining them via the title match.

// Strategy: split by lines, for each line that has both WRONG_HANDLE and WRONG_URL, replace both
const lines = current.split('\n')
let fixedCount = 0
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(WRONG_HANDLE) && lines[i].includes(WRONG_URL)) {
    lines[i] = lines[i].replace(WRONG_HANDLE, RIGHT_HANDLE).replace(WRONG_URL, RIGHT_URL)
    fixedCount++
  }
}

if (fixedCount === 0) {
  console.error('✗ No lines matched the fix pattern. Aborting.')
  process.exit(1)
}
console.log(`✓ Patched ${fixedCount} lines`)

const patched = lines.join('\n')

// 3. Push
const r = await putAsset(ASSET, patched)
if (r.status !== 200) {
  console.error(`✗ push failed: ${r.status}`)
  process.exit(1)
}
console.log(`✓ pushed to live theme`)

// 4. Verify
await new Promise(rs => setTimeout(rs, 2000))
const after = await getAsset(ASSET)
const stillWrong = (after.match(new RegExp(WRONG_HANDLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
const nowCorrect = (after.match(new RegExp(RIGHT_HANDLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
console.log(`\nVerify (live):`)
console.log(`  wrong handle+title remaining: ${stillWrong}`)
console.log(`  correct handle+title now:     ${nowCorrect}`)

writeFileSync(LOG, JSON.stringify({
  shippedAt: new Date().toISOString(),
  theme: THEME, asset: ASSET,
  lineCount: fixedCount,
  before: { wrongHandleCount: beforeHandleCount },
  after: { wrongHandleCount: stillWrong, correctHandleCount: nowCorrect },
}, null, 2))

console.log(`\n━━━ SHIPPED ━━━`)
console.log(`Snapshot: ${LOG}`)
console.log(`Rollback: node scripts/ship-ugc-hardcoded-url-fix.js --rollback`)
console.log(`\nRefresh https://genderrevealideas.com.au/ (incognito to bypass CDN) and click video #1 — should now land on Cannon & Extinguisher Double Bundle.`)
process.exit(0)
