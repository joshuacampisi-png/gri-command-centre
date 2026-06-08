/**
 * SHIP: Fix predictive-search.js bug that's causing 32.78% of JS errors in Clarity
 *
 * Original bug (line 111):
 *   if (currentButtonText.match(new RegExp(previousTerm, 'g')).length > 1)
 *
 * Problems:
 *   1. .match() returns null when no matches → .length throws "null is not an object"
 *   2. previousTerm not regex-escaped → fails on special chars (., *, ?, +, etc.)
 *
 * Fix:
 *   - Escape regex special chars in previousTerm
 *   - Handle null from .match() before reading .length
 *
 * Rollback: node scripts/ship-predictive-search-fix.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const LIVE_THEME = '163830661209'  // main theme
const ASSET_KEY = 'assets/predictive-search.js'

const SNAPSHOT_DIR = 'data/snapshots/predictive-search-fix'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`
const ORIGINAL_BACKUP = `${SNAPSHOT_DIR}/predictive-search.original.js`

const ROLLBACK = process.argv.includes('--rollback')

async function getAsset(themeId, key) {
  const r = await fetch(
    `https://${SHOP}/admin/api/2026-01/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': TOKEN } }
  )
  const j = await r.json()
  return j.asset?.value || ''
}

async function putAsset(themeId, key, value) {
  const r = await fetch(
    `https://${SHOP}/admin/api/2026-01/themes/${themeId}/assets.json`,
    {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: { key, value } }),
    }
  )
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

console.log(`\n=== ${ROLLBACK ? 'ROLLBACK' : 'SHIP'} — Predictive Search JS Bug Fix ===\n`)

// ROLLBACK
if (ROLLBACK) {
  if (!existsSync(ORIGINAL_BACKUP)) { console.error('No backup to rollback'); process.exit(1) }
  const original = readFileSync(ORIGINAL_BACKUP, 'utf8')
  const r = await putAsset(LIVE_THEME, ASSET_KEY, original)
  console.log(r.status === 200 ? `✓ restored predictive-search.js to original` : `✗ rollback failed: ${r.status}`)
  process.exit(0)
}

// 1. Pull current
console.log('1. Pulling current predictive-search.js from live theme...')
const current = await getAsset(LIVE_THEME, ASSET_KEY)
if (!current) { console.error('Could not fetch asset'); process.exit(1) }
console.log(`   ${current.length} chars`)

// 2. Backup
writeFileSync(ORIGINAL_BACKUP, current)
console.log(`   ✓ original backed up to ${ORIGINAL_BACKUP}`)

// 3. Verify the bug is present
const BUGGY_PATTERN = /if\s*\(\s*currentButtonText\.match\(new RegExp\(previousTerm,\s*['"]g['"]\)\)\.length\s*>\s*1\s*\)/
if (!BUGGY_PATTERN.test(current)) {
  console.error('✗ Buggy pattern not found in current file. Maybe already patched? Aborting.')
  process.exit(1)
}
console.log('   ✓ confirmed buggy pattern present')

// 4. Apply fix
const fixed = current.replace(BUGGY_PATTERN, (matched) => {
  return `// [GRI-FIX] regex-escape previousTerm + null-check match result (was throwing in Clarity)
        if (currentButtonText && (function(){
          try {
            const escapedTerm = previousTerm.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
            const matches = currentButtonText.match(new RegExp(escapedTerm, 'g'));
            return matches && matches.length > 1;
          } catch (e) { return false; }
        })())`
})

// Also fix the line just below that uses currentButtonText.replace which has same regex issue
// Line 115: const newButtonText = currentButtonText.replace(previousTerm, newTerm);
// That's already safe because String.replace doesn't blow up on null/missing matches — just returns string unchanged.

if (fixed === current) {
  console.error('✗ Fix did not modify the file. Aborting.')
  process.exit(1)
}
console.log('   ✓ fix applied — bug pattern replaced with escape + null-check')

// 5. Push fix to live theme
console.log('\n2. Pushing patched predictive-search.js to live theme...')
const r = await putAsset(LIVE_THEME, ASSET_KEY, fixed)
if (r.status !== 200) {
  console.error(`✗ Push failed: status ${r.status}`)
  console.error(JSON.stringify(r.json).slice(0, 400))
  process.exit(1)
}
console.log('   ✓ live theme updated')

// 6. Verify
const after = await getAsset(LIVE_THEME, ASSET_KEY)
const stillBuggy = BUGGY_PATTERN.test(after)
const hasFix = /\[GRI-FIX\] regex-escape/.test(after)
console.log(`\n3. Verification:`)
console.log(`   Old pattern present: ${stillBuggy ? '⚠ YES (rollback)' : '✓ NO'}`)
console.log(`   Fix marker present:  ${hasFix ? '✓ YES' : '⚠ NO'}`)

// 7. Save log
writeFileSync(LOG, JSON.stringify({
  shippedAt: new Date().toISOString(),
  themeId: LIVE_THEME,
  assetKey: ASSET_KEY,
  originalLength: current.length,
  patchedLength: fixed.length,
  backupPath: ORIGINAL_BACKUP,
}, null, 2))

console.log(`\n━━━ SHIPPED ${new Date().toISOString()} ━━━`)
console.log(`Snapshot: ${LOG}`)
console.log(`Backup:   ${ORIGINAL_BACKUP}`)
console.log(`Rollback: node scripts/ship-predictive-search-fix.js --rollback`)
console.log(`\nMonitor: Clarity should show 32.78% → near-0% on "currentbuttontext" error within 24h`)
process.exit(0)
