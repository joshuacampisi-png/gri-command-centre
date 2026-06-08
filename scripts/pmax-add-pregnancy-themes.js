/**
 * PREGNANCY ANNOUNCEMENT THEMES
 * Adds 2 high-volume variants to 2 enabled PMAX asset groups.
 * Pure additive — Search Themes are hints, not budget/bid changes.
 * Rollback: --rollback removes whatever this run created.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const SNAPSHOT_DIR = 'data/snapshots/pmax-pregnancy-themes'
mkdirSync(SNAPSHOT_DIR, { recursive: true })

const ROLLBACK = process.argv.includes('--rollback')
const DRY_RUN = !process.argv.includes('--ship') && !ROLLBACK

const TARGETS = [
  { id: '6500812492', name: 'All Products' },
  { id: '6598765304', name: 'Bundles' },
]
const THEMES = [
  'pregnancy announcement',        // 2,400/mo AU
  'pregnancy announcement ideas',  // 1,600/mo AU
]

const LOG_PATH = `${SNAPSHOT_DIR}/ship-log.json`

if (ROLLBACK) {
  if (!existsSync(LOG_PATH)) { console.log('No log to rollback'); process.exit(0) }
  const log = JSON.parse(readFileSync(LOG_PATH,'utf8'))
  const rns = (log.created||[]).filter(x=>x.resource_name).map(x=>x.resource_name)
  if (!rns.length) { console.log('Nothing to remove'); process.exit(0) }
  console.log(`Removing ${rns.length} themes...`)
  await customer.assetGroupSignals.remove(rns)
  console.log('  ✓ Removed')
  process.exit(0)
}

console.log(`\n=== ${DRY_RUN ? 'DRY RUN' : 'SHIPPING'} — Pregnancy announcement themes ===\n`)
console.log(`Target AGs: ${TARGETS.length} | Themes per AG: ${THEMES.length} | Total: ${TARGETS.length*THEMES.length}\n`)

// Snapshot
const before = []
for (const ag of TARGETS) {
  const t = await customer.query(`SELECT asset_group_signal.search_theme.text FROM asset_group_signal WHERE asset_group.id=${ag.id}`)
  const existing = t.map(r => r.asset_group_signal?.search_theme?.text).filter(Boolean)
  before.push({ ...ag, existing })
  console.log(`  ${ag.name}: ${existing.length} existing themes`)
}
writeFileSync(`${SNAPSHOT_DIR}/before.json`, JSON.stringify({ takenAt:new Date().toISOString(), assetGroups:before }, null, 2))

if (DRY_RUN) {
  console.log(`\nDRY RUN. Operations preview:`)
  for (const ag of TARGETS) for (const t of THEMES) console.log(`  + "${t}" → ${ag.name}`)
  console.log(`\nRun with --ship to execute.`)
  process.exit(0)
}

const log = { startedAt: new Date().toISOString(), created: [], skipped: [], failed: [] }
for (const ag of TARGETS) {
  const existing = before.find(b=>b.id===ag.id).existing
  for (const theme of THEMES) {
    if (existing.some(t => t.toLowerCase() === theme.toLowerCase())) {
      log.skipped.push({ ag:ag.name, theme })
      console.log(`  ⊘ "${theme}" → ${ag.name} (already exists)`)
      continue
    }
    try {
      const res = await customer.assetGroupSignals.create([{
        asset_group: `customers/${custId}/assetGroups/${ag.id}`,
        search_theme: { text: theme },
      }])
      const rn = res?.results?.[0]?.resource_name
      log.created.push({ ag:ag.name, ag_id:ag.id, theme, resource_name: rn })
      console.log(`  ✓ "${theme}" → ${ag.name}`)
    } catch (e) {
      const msg = e?.errors?.[0]?.message || e?.message
      log.failed.push({ ag:ag.name, theme, error: msg })
      console.log(`  ✗ "${theme}" → ${ag.name}: ${msg}`)
    }
    await new Promise(r => setTimeout(r, 500))
  }
}
log.completedAt = new Date().toISOString()
writeFileSync(LOG_PATH, JSON.stringify(log, null, 2))
console.log(`\n✓ DONE — Created: ${log.created.length} | Skipped: ${log.skipped.length} | Failed: ${log.failed.length}`)
console.log(`Rollback: node scripts/pmax-add-pregnancy-themes.js --rollback`)
process.exit(0)
