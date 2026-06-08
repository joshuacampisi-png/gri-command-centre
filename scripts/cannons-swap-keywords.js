/**
 * Search Cannons keyword swap:
 * 1. PAUSE "gender reveal bomb" PHRASE   ($26, 0 conv in 5 weeks)
 * 2. PAUSE "gender reveal gun" PHRASE    ($6, 0 conv)
 * 3. ADD   "gender reveal smoke bomb" PHRASE (new, $1 CPC default)
 *
 * Rollback: --rollback re-enables paused + pauses new
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const SNAPSHOT_DIR = 'data/snapshots/cannons-swap-keywords'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const CAMP = 21094179575
const AG_ID = 165478691488  // Active ad group in Search Cannons
const ROLLBACK = process.argv.includes('--rollback')

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SWAP'} — Search Cannons keyword changes ===\n`)

const TO_PAUSE = [
  { text:'gender reveal bomb', mt:3, mtName:'PHRASE' },
  { text:'gender reveal gun', mt:3, mtName:'PHRASE' },
]
const TO_ADD = [
  { text:'gender reveal smoke bomb', mt:'PHRASE', cpc_micros: 1_000_000 },
]

// Find current keywords
const kw = await customer.query(`SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status FROM ad_group_criterion WHERE campaign.id=${CAMP} AND ad_group_criterion.type='KEYWORD'`)

const log = { shippedAt:new Date().toISOString(), actions:[] }

if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const prev = JSON.parse(readFileSync(LOG,'utf8'))
  for (const a of prev.actions||[]) {
    if (a.action==='pause' && a.resource_name) {
      try { await customer.adGroupCriteria.update([{ resource_name:a.resource_name, status:'ENABLED' }]); console.log(`  ✓ Re-enabled "${a.keyword}"`) } catch(e){ console.log(`  ✗ ${e?.errors?.[0]?.message}`) }
    }
    if (a.action==='create' && a.resource_name) {
      try { await customer.adGroupCriteria.update([{ resource_name:a.resource_name, status:'PAUSED' }]); console.log(`  ✓ Paused new "${a.keyword}"`) } catch(e){ console.log(`  ✗ ${e?.errors?.[0]?.message}`) }
    }
  }
  console.log('Rollback complete')
  process.exit(0)
}

// 1. Pause the 2 dead keywords
for (const t of TO_PAUSE) {
  const target = kw.find(r => r.ad_group_criterion?.keyword?.text===t.text && r.ad_group_criterion?.keyword?.match_type===t.mt && r.ad_group_criterion?.status===2)
  if (!target) { console.log(`  ⚠ "${t.text}" ${t.mtName} not found enabled, skipping`); continue }
  const rn = `customers/${custId}/adGroupCriteria/${target.ad_group?.id}~${target.ad_group_criterion?.criterion_id}`
  try {
    await customer.adGroupCriteria.update([{ resource_name:rn, status:'PAUSED' }])
    console.log(`  ✓ PAUSED "${t.text}" ${t.mtName}`)
    log.actions.push({ action:'pause', keyword:t.text, match:t.mtName, resource_name:rn })
  } catch (e) {
    console.log(`  ✗ Pause "${t.text}" failed: ${e?.errors?.[0]?.message}`)
  }
  await new Promise(r=>setTimeout(r,400))
}

// 2. Add the new keyword
for (const t of TO_ADD) {
  try {
    const res = await customer.adGroupCriteria.create([{
      ad_group: `customers/${custId}/adGroups/${AG_ID}`,
      status: 'ENABLED',
      keyword: { text: t.text, match_type: t.mt },
      cpc_bid_micros: t.cpc_micros,
    }])
    const rn = res?.results?.[0]?.resource_name
    console.log(`  ✓ CREATED "${t.text}" ${t.mt} at $${t.cpc_micros/1e6} CPC`)
    log.actions.push({ action:'create', keyword:t.text, match:t.mt, cpc:t.cpc_micros/1e6, resource_name:rn })
  } catch (e) {
    console.log(`  ✗ Create "${t.text}" failed: ${e?.errors?.[0]?.message}`)
  }
  await new Promise(r=>setTimeout(r,400))
}

writeFileSync(LOG, JSON.stringify(log,null,2))
console.log(`\n✓ Done — ${log.actions.length} actions`)
console.log(`Log: ${LOG}`)
console.log(`Rollback: node scripts/cannons-swap-keywords.js --rollback`)
process.exit(0)
