/**
 * PMAX SEARCH THEME EXPANSION — "gender reveal ideas" + variants
 * ================================================================
 *
 * INTENT
 *   The query "gender reveal ideas" (5,400 AU searches/mo, $0.66 CPC, the #1 head
 *   term in the niche) currently triggers ZERO PMAX impressions because the only
 *   asset groups that had it as a Search Theme are now PAUSED.
 *
 *   This script adds "gender reveal ideas" + 2 variants to all 5 ENABLED PMAX
 *   asset groups so PMAX's brand auto-filter has a strong-enough hint to enter
 *   the auction on this query.
 *
 * WHY THIS IS LOW RISK
 *   - Search Themes are HINTS to PMAX's bidder, not mandates
 *   - No budget change, no bid change, no tROAS change
 *   - PMAX still controls whether to bid based on its trained ROAS model
 *   - Zero structural changes — additive only
 *   - Rollback = delete 15 Search Theme resource_names (1 minute)
 *
 * GUARDRAIL (THE WATCHDOG)
 *   "gender reveal ideas" is high-volume. If PMAX decides it converts well, it
 *   could pull significant spend away from current winners. The companion script
 *   scripts/pmax-ideas-watchdog.js runs daily and alerts if:
 *     - Any enabled asset group spend goes >40% above 14-day baseline
 *     - Account-wide PMAX ROAS drops >25% w/w
 *     - Total PMAX daily spend exceeds $400 (vs ~$190/day current avg)
 *
 * USAGE
 *   Dry run:  node scripts/pmax-add-ideas-themes.js
 *   Ship:     node scripts/pmax-add-ideas-themes.js --ship
 *   Rollback: node scripts/pmax-add-ideas-themes.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const custId = getGadsCustomerId()

const DRY_RUN = !process.argv.includes('--ship') && !process.argv.includes('--rollback')
const ROLLBACK = process.argv.includes('--rollback')

// ============== TARGETS ==============
// 5 enabled PMAX asset groups that currently DO NOT have "gender reveal ideas"
// TEST PAIR ONLY (2 of 5). Expand to others after 5-7 day measurement.
// Control group (NOT touched in test): Reveal Cannons, Smoke Bombs, Extinguishers
const TARGET_AGS = [
  { id: '6500812492', campaign: 'GRI PMAX | All Products', name: 'All Products' },  // catch-all
  { id: '6598765304', campaign: 'GRI PMAX | Bundles',      name: 'Bundles' },        // intent match
]

const NEW_THEMES = [
  'gender reveal ideas',
  'gender reveal ideas australia',
  'best gender reveal ideas',
]

const SNAPSHOT_DIR = 'data/snapshots/pmax-ideas-themes'
mkdirSync(SNAPSHOT_DIR, { recursive: true })

// ============== ROLLBACK PATH ==============
if (ROLLBACK) {
  console.log(`\n========== ROLLBACK MODE ==========\n`)
  const logPath = `${SNAPSHOT_DIR}/ship-log.json`
  if (!existsSync(logPath)) { console.error(`No ship log at ${logPath}`); process.exit(1) }
  const log = JSON.parse(readFileSync(logPath, 'utf8'))
  const ops = []
  for (const a of log.created || []) {
    if (!a.resource_name) continue
    ops.push({ remove: a.resource_name })
  }
  console.log(`Removing ${ops.length} Search Themes created on ${log.completedAt}`)
  if (!ops.length) { console.log('Nothing to remove'); process.exit(0) }
  try {
    const res = await customer.assetGroupSignals.remove(ops.map(o => o.remove))
    console.log(`  ✓ Removed: ${res?.results?.length} signals`)
  } catch (e) {
    console.error(`  ✗ FAILED: ${e?.errors?.[0]?.message || e?.message}`)
    process.exit(1)
  }
  console.log(`\nROLLBACK COMPLETE.`)
  process.exit(0)
}

// ============== INFO ==============
console.log(`\n========== ${DRY_RUN ? 'DRY RUN' : 'SHIPPING'} — Add "${NEW_THEMES[0]}" + variants to PMAX ==========\n`)
console.log(`Target asset groups: ${TARGET_AGS.length}`)
console.log(`Themes to add per AG: ${NEW_THEMES.length}`)
console.log(`Total Search Themes to create: ${TARGET_AGS.length * NEW_THEMES.length}`)
console.log(``)

// ============== SNAPSHOT BEFORE ==============
console.log(`--- Snapshot BEFORE ---`)
const before = []
for (const ag of TARGET_AGS) {
  const themes = await customer.query(`
    SELECT asset_group.id, asset_group_signal.search_theme.text
    FROM asset_group_signal
    WHERE asset_group.id = ${ag.id}
  `)
  const existing = themes
    .map(r => r.asset_group_signal?.search_theme?.text || r.assetGroupSignal?.searchTheme?.text)
    .filter(Boolean)
  console.log(`  ${ag.campaign} > ${ag.name} (${ag.id}): ${existing.length} existing themes`)
  before.push({ ...ag, existingThemes: existing })
}
const snapshotPath = `${SNAPSHOT_DIR}/before.json`
writeFileSync(snapshotPath, JSON.stringify({ takenAt: new Date().toISOString(), assetGroups: before }, null, 2))
console.log(`  Snapshot saved: ${snapshotPath}`)

if (DRY_RUN) {
  console.log(`\n>>> DRY RUN — no mutations sent. Re-run with --ship to execute.\n`)
  console.log(`Preview of operations:`)
  for (const ag of TARGET_AGS) {
    for (const theme of NEW_THEMES) {
      console.log(`  + asset_group ${ag.id} (${ag.name}) ← Search Theme "${theme}"`)
    }
  }
  process.exit(0)
}

// ============== EXECUTE ==============
console.log(`\n--- Creating Search Themes ---`)
const log = { startedAt: new Date().toISOString(), snapshot: snapshotPath, created: [], failed: [] }

const ops = []
for (const ag of TARGET_AGS) {
  for (const theme of NEW_THEMES) {
    // Skip if already exists (idempotency safety)
    const existing = before.find(b => b.id === ag.id)?.existingThemes || []
    if (existing.some(t => t.toLowerCase() === theme.toLowerCase())) {
      console.log(`  ⊘ SKIP "${theme}" on ${ag.name} — already exists`)
      continue
    }
    ops.push({
      ag,
      theme,
      payload: {
        asset_group: `customers/${custId}/assetGroups/${ag.id}`,
        search_theme: { text: theme },
      },
    })
  }
}

if (!ops.length) { console.log(`Nothing to create — all themes already exist.`); process.exit(0) }

// Batch create (single mutate request — atomic)
try {
  const res = await customer.assetGroupSignals.create(ops.map(o => o.payload))
  const results = res?.results || []
  for (let i = 0; i < ops.length; i++) {
    const rn = results[i]?.resource_name
    if (rn) {
      log.created.push({ ag_id: ops[i].ag.id, ag_name: ops[i].ag.name, campaign: ops[i].ag.campaign, theme: ops[i].theme, resource_name: rn })
      console.log(`  ✓ "${ops[i].theme}" → ${ops[i].ag.name} (${rn.split('/').pop()})`)
    } else {
      log.failed.push({ ...ops[i], error: 'no resource_name returned' })
      console.log(`  ✗ "${ops[i].theme}" → ${ops[i].ag.name} — no resource_name`)
    }
  }
} catch (e) {
  const msg = e?.errors?.[0]?.message || e?.message
  console.log(`  ✗ BATCH FAILED: ${msg}`)
  log.batchError = msg
  // Fallback: try one-by-one to identify the offender
  console.log(`  Retrying one-by-one to identify offender...`)
  for (const op of ops) {
    try {
      const r = await customer.assetGroupSignals.create([op.payload])
      const rn = r?.results?.[0]?.resource_name
      log.created.push({ ag_id: op.ag.id, ag_name: op.ag.name, campaign: op.ag.campaign, theme: op.theme, resource_name: rn })
      console.log(`    ✓ "${op.theme}" → ${op.ag.name}`)
    } catch (e2) {
      log.failed.push({ ag_id: op.ag.id, ag_name: op.ag.name, theme: op.theme, error: e2?.errors?.[0]?.message || e2?.message })
      console.log(`    ✗ "${op.theme}" → ${op.ag.name}: ${e2?.errors?.[0]?.message}`)
    }
    await new Promise(r => setTimeout(r, 400))
  }
}

log.completedAt = new Date().toISOString()
writeFileSync(`${SNAPSHOT_DIR}/ship-log.json`, JSON.stringify(log, null, 2))
console.log(`\n✓ DONE — Created: ${log.created.length}  Failed: ${log.failed.length}`)
console.log(`  Log: ${SNAPSHOT_DIR}/ship-log.json`)
console.log(`  Rollback: node scripts/pmax-add-ideas-themes.js --rollback`)
console.log(`\n  Watchdog: node scripts/pmax-ideas-watchdog.js   (run daily)`)
process.exit(0)
