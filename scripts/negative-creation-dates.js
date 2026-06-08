/**
 * Find when negative keywords were originally added — was it old agency?
 * Queries change_event for criterion creations + change_status for old criteria
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== WHO ADDED THE NEGATIVES? Investigation ===\n`)

// 1. Try change_event lookback (Google Ads typically supports 30-90 days)
console.log(`--- METHOD 1: change_event history (lookback typically 30-90 days) ---`)
try {
  const events = await c.query(`
    SELECT change_event.change_date_time,
           change_event.user_email,
           change_event.client_type,
           change_event.change_resource_type,
           change_event.resource_change_operation,
           change_event.changed_fields,
           change_event.campaign,
           change_event.feed
    FROM change_event
    WHERE change_event.change_date_time >= '2024-01-01'
      AND change_event.change_resource_type IN ('CAMPAIGN_CRITERION', 'SHARED_CRITERION')
    ORDER BY change_event.change_date_time ASC
    LIMIT 200
  `)
  if (!events.length) console.log('  No change events in lookback window')
  for (const e of events) {
    const ev = e.change_event
    const dt = ev?.change_date_time?.slice(0,16)
    const op = ev?.resource_change_operation === 2 ? 'CREATE' : ev?.resource_change_operation === 3 ? 'UPDATE' : ev?.resource_change_operation === 4 ? 'REMOVE' : 'OTHER'
    const who = ev?.user_email || 'unknown'
    const type = ev?.change_resource_type
    console.log(`  ${dt} | ${op.padEnd(7)} | ${type.padEnd(20)} | by: ${who}`)
  }
} catch (e) {
  console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,200)}`)
}

// 2. Pull all currently-active negatives in shared lists with their criterion_id (lower = older)
console.log(`\n--- METHOD 2: Shared negative IDs (lower ID = added earlier in account history) ---`)
const shared = await c.query(`
  SELECT shared_set.name, shared_criterion.criterion_id, shared_criterion.keyword.text, shared_criterion.keyword.match_type
  FROM shared_criterion
  ORDER BY shared_criterion.criterion_id ASC
`)
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}
let i = 0
console.log(`  First 30 by criterion_id (lowest = oldest in this account):`)
for (const r of shared) {
  if (i++ >= 30) break
  console.log(`  ID ${String(r.shared_criterion?.criterion_id).padStart(15)} | [${r.shared_set?.name}] "${r.shared_criterion?.keyword?.text}" ${MT[r.shared_criterion?.keyword?.match_type]}`)
}

console.log(`\n  Last 10 by criterion_id (most recent additions):`)
const sortedDesc = [...shared].sort((a,b)=>Number(b.shared_criterion?.criterion_id||0)-Number(a.shared_criterion?.criterion_id||0)).slice(0,10)
for (const r of sortedDesc) {
  console.log(`  ID ${String(r.shared_criterion?.criterion_id).padStart(15)} | [${r.shared_set?.name}] "${r.shared_criterion?.keyword?.text}" ${MT[r.shared_criterion?.keyword?.match_type]}`)
}

// 3. Account-level change_status — newer rows = more recently touched
console.log(`\n--- METHOD 3: Account-level changes summary (last 90 days) ---`)
try {
  const changes = await c.query(`
    SELECT change_status.last_change_date_time, change_status.resource_type, change_status.resource_status
    FROM change_status
    WHERE change_status.last_change_date_time >= '2024-01-01'
      AND change_status.resource_type IN ('CAMPAIGN_CRITERION','SHARED_CRITERION')
    ORDER BY change_status.last_change_date_time ASC
    LIMIT 100
  `)
  if (!changes.length) console.log('  No data')
  let earliest = null, latest = null
  for (const r of changes) {
    const dt = r.change_status?.last_change_date_time
    if (!earliest || dt < earliest) earliest = dt
    if (!latest || dt > latest) latest = dt
  }
  console.log(`  Earliest negative-related change in lookback: ${earliest}`)
  console.log(`  Latest negative-related change in lookback:   ${latest}`)
} catch (e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,200)}`) }

// 4. Look at customer/account creation date for context
console.log(`\n--- METHOD 4: Account context ---`)
const cust = await c.query(`SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer`)
for (const r of cust) {
  console.log(`  Account: ${r.customer?.descriptive_name} (${r.customer?.id})`)
  console.log(`  Currency: ${r.customer?.currency_code} | TZ: ${r.customer?.time_zone}`)
}

process.exit(0)
