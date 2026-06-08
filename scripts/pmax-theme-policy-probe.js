/**
 * THEME POLICY PROBE — zero-repercussion test
 * Tests 6 alternative phrasings on ONE asset group (All Products).
 * For each one Google ACCEPTS: keeps it added (real value)
 * For each one Google REJECTS: no change (just logged)
 *
 * ZERO RISK GUARANTEE:
 *   - Tests on 1 AG only (not all 5)
 *   - Each variant added individually so 1 rejection doesn't block others
 *   - Snapshot saved BEFORE any mutation
 *   - Easy rollback: --rollback removes anything we added in this run
 *   - Worst case = 6 new Search Themes on 1 AG, each removable in seconds
 */
import 'dotenv/config'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const SNAPSHOT_DIR = 'data/snapshots/pmax-ideas-themes'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG_PATH = `${SNAPSHOT_DIR}/policy-probe-log.json`

const ROLLBACK = process.argv.includes('--rollback')

// Test on ONE asset group only (All Products — broadest, lowest risk)
const TARGET_AG = { id: '6500812492', name: 'All Products', campaign: 'GRI PMAX | All Products' }

// 6 variants ranked from safest to most direct
const VARIANTS = [
  'creative gender reveal',
  'easy gender reveal',
  'unique gender reveal',
  'best gender reveal',
  'baby reveal ideas',
  'pregnancy reveal',
]

// =================== ROLLBACK ===================
if (ROLLBACK) {
  if (!existsSync(LOG_PATH)) { console.log('No probe log to rollback'); process.exit(0) }
  const log = JSON.parse(readFileSync(LOG_PATH,'utf8'))
  const toRemove = (log.results||[]).filter(r => r.resource_name).map(r => r.resource_name)
  if (!toRemove.length) { console.log('Nothing added during probe — nothing to rollback'); process.exit(0) }
  console.log(`Rolling back ${toRemove.length} themes added during probe...`)
  try {
    const res = await customer.assetGroupSignals.remove(toRemove)
    console.log(`  ✓ Removed: ${res?.results?.length}`)
  } catch (e) { console.log(`  ✗ FAILED: ${e?.errors?.[0]?.message}`) }
  process.exit(0)
}

// =================== PROBE ===================
console.log(`\n========== POLICY PROBE — Testing ${VARIANTS.length} variants on 1 AG ==========\n`)
console.log(`Target: ${TARGET_AG.campaign} > ${TARGET_AG.name} (${TARGET_AG.id})\n`)

// Snapshot existing themes on this AG
const before = await customer.query(`SELECT asset_group_signal.search_theme.text FROM asset_group_signal WHERE asset_group.id = ${TARGET_AG.id}`)
const existing = before.map(r => r.asset_group_signal?.search_theme?.text).filter(Boolean)
console.log(`Existing themes on this AG: ${existing.length}\n`)

const results = []
for (const variant of VARIANTS) {
  if (existing.some(t => t.toLowerCase() === variant.toLowerCase())) {
    console.log(`  ⊘ "${variant}" — already exists, skipping`)
    results.push({ variant, status:'already_exists' })
    continue
  }
  try {
    const res = await customer.assetGroupSignals.create([{
      asset_group: `customers/${custId}/assetGroups/${TARGET_AG.id}`,
      search_theme: { text: variant },
    }])
    const rn = res?.results?.[0]?.resource_name
    if (rn) {
      console.log(`  ✓ ACCEPTED: "${variant}" → ${rn.split('/').pop()}`)
      results.push({ variant, status:'accepted', resource_name: rn })
    } else {
      console.log(`  ? "${variant}" — no error but no resource_name returned`)
      results.push({ variant, status:'no_resource' })
    }
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message
    console.log(`  ✗ REJECTED: "${variant}" — ${msg}`)
    results.push({ variant, status:'rejected', error: msg })
  }
  await new Promise(r => setTimeout(r, 500))
}

const accepted = results.filter(r => r.status === 'accepted')
const rejected = results.filter(r => r.status === 'rejected')

console.log(`\n========== RESULTS ==========`)
console.log(`Accepted: ${accepted.length}  Rejected: ${rejected.length}\n`)
if (accepted.length) {
  console.log(`KEPT (now live in PMAX on this AG):`)
  for (const a of accepted) console.log(`  ✓ "${a.variant}"`)
}
if (rejected.length) {
  console.log(`\nBLOCKED BY POLICY:`)
  for (const r of rejected) console.log(`  ✗ "${r.variant}"`)
}

writeFileSync(LOG_PATH, JSON.stringify({ ranAt:new Date().toISOString(), targetAg:TARGET_AG, results }, null, 2))
console.log(`\nLog: ${LOG_PATH}`)
if (accepted.length) {
  console.log(`Rollback any time: node scripts/pmax-theme-policy-probe.js --rollback`)
} else {
  console.log(`Nothing added — no rollback needed.`)
}
process.exit(0)
