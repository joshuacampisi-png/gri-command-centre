/**
 * MAY 16 SHIP — Josh authorized both changes for immediate execution.
 *
 * 1. url_expansion_opt_out = TRUE on the 3 PMAX campaigns
 *    (stops /pages/contact + other unintended URL routing)
 * 2. Cannon & Powder tROAS 200% → 170%
 *    (audit's -15% recommendation to chase Top IS lift)
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const customerId = getGadsCustomerId()

mkdirSync('data/snapshots/gads-ship-may16', { recursive: true })

const ts = new Date().toISOString().slice(0, 19)
console.log(`\n========== MAY 16 SHIP — ${ts} ==========\n`)

// ── STEP 0: snapshot tROAS only (url_expansion_opt_out not queryable in v23 SELECT) ──
console.log('--- STEP 0: SNAPSHOT CURRENT tROAS ---')
const targets = [
  { id: '21113841118', name: 'GRI PMAX | All Products' },
  { id: '22841772135', name: 'GRI PMAX | Bundles' },
  { id: '21511998936', name: 'GRI PMAX | Cannon & Powder Reveals' },
]
const snapshot = { takenAt: new Date().toISOString(), campaigns: [] }
for (const t of targets) {
  const r = await customer.query(`
    SELECT campaign.id, campaign.name,
           campaign.maximize_conversion_value.target_roas
    FROM campaign
    WHERE campaign.id = ${t.id}
  `)
  const c = r[0]?.campaign
  console.log(`  ${t.name}: tROAS=${c?.maximize_conversion_value?.target_roas}`)
  snapshot.campaigns.push({ id: t.id, name: t.name, target_roas: c?.maximize_conversion_value?.target_roas })
}
writeFileSync('data/snapshots/gads-ship-may16/pre-snapshot.json', JSON.stringify(snapshot, null, 2))

// ── STEP 1: url_expansion_opt_out = TRUE on all 3 PMAX ──
console.log('\n--- STEP 1: DISABLE URL EXPANSION ON 3 PMAX CAMPAIGNS ---')
const expansionLog = []
for (const t of targets) {
  console.log(`  ${t.name} (${t.id})...`)
  try {
    const result = await customer.campaigns.update([
      {
        resource_name: `customers/${customerId}/campaigns/${t.id}`,
        url_expansion_opt_out: true,
      },
    ])
    console.log(`    ✓ ${result?.results?.[0]?.resource_name}`)
    expansionLog.push({ id: t.id, name: t.name, status: 'OK', resource: result?.results?.[0]?.resource_name })
  } catch (e) {
    console.log(`    ✗ FAILED: ${e?.errors?.[0]?.message || e?.message}`)
    expansionLog.push({ id: t.id, name: t.name, status: 'FAILED', error: e?.errors?.[0]?.message || e?.message })
  }
  await new Promise(r => setTimeout(r, 1000))
}

// ── STEP 2: Drop Cannon & Powder tROAS from 200% to 170% ──
console.log('\n--- STEP 2: CANNON & POWDER tROAS 200% → 170% ---')
let troasLog = {}
try {
  const result = await customer.campaigns.update([
    {
      resource_name: `customers/${customerId}/campaigns/21511998936`,
      maximize_conversion_value: { target_roas: 1.70 },
    },
  ])
  console.log(`  ✓ ${result?.results?.[0]?.resource_name}`)
  troasLog = { id: '21511998936', status: 'OK', new_target_roas: 1.70, resource: result?.results?.[0]?.resource_name }
} catch (e) {
  console.log(`  ✗ FAILED: ${e?.errors?.[0]?.message || e?.message}`)
  troasLog = { id: '21511998936', status: 'FAILED', error: e?.errors?.[0]?.message || e?.message }
}

// ── Save execution log ──
writeFileSync('data/snapshots/gads-ship-may16/execution-log.json', JSON.stringify({
  ranAt: new Date().toISOString(),
  step1_url_expansion: expansionLog,
  step2_troas: troasLog,
  snapshot,
}, null, 2))

console.log(`\n========== SHIP COMPLETE ==========`)
console.log(`Pre-snapshot:  data/snapshots/gads-ship-may16/pre-snapshot.json`)
console.log(`Execution log: data/snapshots/gads-ship-may16/execution-log.json`)
console.log(`\nROLLBACK PATHS:`)
console.log(`  url_expansion: set url_expansion_opt_out = false on the 3 campaigns`)
console.log(`  tROAS:        set Cannon & Powder target_roas back to 2.00`)
console.log()
process.exit(0)
