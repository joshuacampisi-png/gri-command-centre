/**
 * SHIP: Defer confetti animation to DOMContentLoaded
 *
 * Change: wraps confetti() call so it runs AFTER DOM is parsed instead of
 * blocking initial paint. Zero functional change — confetti still appears
 * on pages with .confetti-particles elements, just ~10ms later.
 *
 * Rollback: node scripts/ship-defer-confetti.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const LIVE_THEME = '163830661209'
const ASSET_KEY = 'layout/theme.liquid'

const SNAPSHOT_DIR = 'data/snapshots/defer-confetti'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`
const BACKUP = `${SNAPSHOT_DIR}/theme.original.liquid`
const ROLLBACK = process.argv.includes('--rollback')

async function getAsset(themeId, key) {
  const r = await fetch(`https://${SHOP}/admin/api/2026-01/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { headers: { 'X-Shopify-Access-Token': TOKEN } })
  return (await r.json()).asset?.value || ''
}
async function putAsset(themeId, key, value) {
  const r = await fetch(`https://${SHOP}/admin/api/2026-01/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } }),
  })
  return { status: r.status, json: await r.json().catch(()=>({})) }
}

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — Defer Confetti to DOMContentLoaded ===\n`)

if (ROLLBACK) {
  if (!existsSync(BACKUP)) { console.error('No backup'); process.exit(1) }
  const original = readFileSync(BACKUP, 'utf8')
  const r = await putAsset(LIVE_THEME, ASSET_KEY, original)
  console.log(r.status === 200 ? '✓ rolled back to original' : '✗ rollback failed')
  process.exit(0)
}

// 1. Pull current
const current = await getAsset(LIVE_THEME, ASSET_KEY)
console.log(`Current theme.liquid: ${current.length} chars`)
writeFileSync(BACKUP, current)
console.log(`✓ backed up to ${BACKUP}`)

// 2. Find the EXACT confetti() invocation line
// Pattern: bare "confetti();" call on its own line (line 965 in our inspection)
const PATTERN = /\n(\s*)confetti\(\);(\s*\n\s*<\/script>)/

if (!PATTERN.test(current)) {
  console.error('✗ Could not find confetti() invocation pattern. File may have changed.')
  process.exit(1)
}
console.log('✓ confirmed confetti() invocation pattern present')

// 3. Wrap in DOMContentLoaded
const patched = current.replace(PATTERN, (match, indent, ending) => {
  return `\n${indent}// [GRI-FIX] Defer to DOMContentLoaded to reduce INP (was running on parse)\n${indent}if (document.readyState === 'loading') {\n${indent}  document.addEventListener('DOMContentLoaded', confetti);\n${indent}} else {\n${indent}  confetti();\n${indent}}${ending}`
})

if (patched === current) {
  console.error('✗ Patch did not modify file')
  process.exit(1)
}
console.log('✓ patch applied — confetti() now waits for DOMContentLoaded')

// 4. Push
const r = await putAsset(LIVE_THEME, ASSET_KEY, patched)
if (r.status !== 200) {
  console.error(`✗ Push failed: ${r.status}`)
  console.error(JSON.stringify(r.json).slice(0, 300))
  process.exit(1)
}
console.log('✓ live theme updated')

// 5. Verify by re-fetching
await new Promise(rs => setTimeout(rs, 1500))
const after = await getAsset(LIVE_THEME, ASSET_KEY)
const hasFix = /\[GRI-FIX\] Defer to DOMContentLoaded/.test(after)
console.log(`\nVerify: fix marker present = ${hasFix ? '✓ YES' : '⚠ NO (check manually)'}`)

writeFileSync(LOG, JSON.stringify({
  shippedAt: new Date().toISOString(),
  themeId: LIVE_THEME,
  assetKey: ASSET_KEY,
  originalLength: current.length,
  patchedLength: patched.length,
  backupPath: BACKUP,
  change: 'wrapped confetti() in DOMContentLoaded check',
}, null, 2))

console.log(`\n━━━ SHIPPED ${new Date().toISOString()} ━━━`)
console.log(`Backup:   ${BACKUP}`)
console.log(`Rollback: node scripts/ship-defer-confetti.js --rollback`)
process.exit(0)
