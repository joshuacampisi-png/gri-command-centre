/**
 * v2: Find when the head-term negatives we removed were originally added
 * Targets specific keywords + queries change_event for criterion changes
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== NEGATIVE KEYWORD CREATION DATES (forensic) ===\n`)

// Method 1: change_event for any negative keyword work (lookback)
console.log(`--- METHOD 1: change_event for criterion changes ---`)
console.log(`(Google Ads usually only retains 30 days of change_event history)\n`)
try {
  const events = await c.query(`
    SELECT change_event.change_date_time,
           change_event.user_email,
           change_event.client_type,
           change_event.change_resource_type,
           change_event.resource_change_operation,
           change_event.campaign
    FROM change_event
    WHERE change_event.change_date_time DURING LAST_30_DAYS
      AND change_event.change_resource_type IN ('CAMPAIGN_CRITERION','SHARED_CRITERION')
    ORDER BY change_event.change_date_time ASC
    LIMIT 500
  `)
  if (!events.length) console.log('  No change events found in lookback')
  const byUser = {}
  const byMonth = {}
  for (const e of events) {
    const ev = e.change_event
    const dt = ev?.change_date_time?.slice(0,10)
    const who = ev?.user_email || 'system'
    const op = ev?.resource_change_operation === 2 ? 'CREATE' : ev?.resource_change_operation === 3 ? 'UPDATE' : ev?.resource_change_operation === 4 ? 'REMOVE' : 'OTHER'
    byUser[who] = (byUser[who]||0) + 1
    byMonth[dt] = (byMonth[dt]||0) + 1
  }
  console.log(`Total events: ${events.length}`)
  console.log(`\nBy user (who edited negatives):`)
  for (const [u, c] of Object.entries(byUser).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${u.padEnd(40)} ${c} changes`)
  }
  console.log(`\nFirst 5 events:`)
  for (const e of events.slice(0,5)) {
    const ev = e.change_event
    const op = ev?.resource_change_operation === 2 ? 'CREATE' : ev?.resource_change_operation === 4 ? 'REMOVE' : 'UPDATE'
    console.log(`  ${ev?.change_date_time?.slice(0,16)} | ${op.padEnd(7)} | ${ev?.change_resource_type} | ${ev?.user_email||'system'}`)
  }
  console.log(`\nLast 5 events:`)
  for (const e of events.slice(-5)) {
    const ev = e.change_event
    const op = ev?.resource_change_operation === 2 ? 'CREATE' : ev?.resource_change_operation === 4 ? 'REMOVE' : 'UPDATE'
    console.log(`  ${ev?.change_date_time?.slice(0,16)} | ${op.padEnd(7)} | ${ev?.change_resource_type} | ${ev?.user_email||'system'}`)
  }
} catch (e) {
  console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,200)}`)
}

// Method 2: Use shared_set criterion IDs as proxy for age
console.log(`\n--- METHOD 2: ID-based forensics on the specific keywords we ALREADY removed ---`)
console.log(`(Lower criterion_id = added earlier in Google Ads global timeline)\n`)
const removedKeywords = [
  'gender reveal ideas',
  'gender reveal ideas reviews',
  'genderrevealideas',
  'sports gender reveal ideas',
]
console.log(`The 5 brand negatives we removed (May 19) — already gone, can't pull IDs.`)
console.log(`But we CAN see ages of remaining brand+TNT negatives still in the lists:\n`)
const rem = await c.query(`SELECT shared_set.name, shared_criterion.criterion_id, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.name IN ('Brand Negatives','TNT Hire Negatives','General Negs') ORDER BY shared_criterion.criterion_id ASC`)
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}

const buckets = { old: [], mid: [], recent: [] }
for (const r of rem) {
  const id = Number(r.shared_criterion?.criterion_id)
  if (id < 100_000_000) buckets.old.push(r)
  else if (id < 1_000_000_000) buckets.mid.push(r)
  else buckets.recent.push(r)
}
console.log(`OLD (ID < 100M — likely 2020 or earlier, before your account):`)
for (const r of buckets.old.slice(0,5)) console.log(`  ID ${r.shared_criterion.criterion_id} | [${r.shared_set.name}] "${r.shared_criterion.keyword.text}" ${MT[r.shared_criterion.keyword.match_type]}`)
console.log(`  ... ${buckets.old.length} total`)

console.log(`\nMID-ERA (ID 100M-1B — likely 2021-2023):`)
for (const r of buckets.mid.slice(0,5)) console.log(`  ID ${r.shared_criterion.criterion_id} | [${r.shared_set.name}] "${r.shared_criterion.keyword.text}" ${MT[r.shared_criterion.keyword.match_type]}`)
console.log(`  ... ${buckets.mid.length} total`)

console.log(`\nRECENT (ID > 1B — likely 2024+):`)
for (const r of buckets.recent.slice(0,10)) console.log(`  ID ${r.shared_criterion.criterion_id} | [${r.shared_set.name}] "${r.shared_criterion.keyword.text}" ${MT[r.shared_criterion.keyword.match_type]}`)
console.log(`  ... ${buckets.recent.length} total`)

// Method 3: Check the 5 that we already removed via their resource_name in our snapshot
console.log(`\n--- METHOD 3: From snapshot logs, the 5 brand negatives removed May 19 ---`)
try {
  const { readFileSync, existsSync } = await import('fs')
  if (existsSync('data/snapshots/remove-brand-negatives/log.json')) {
    const log = JSON.parse(readFileSync('data/snapshots/remove-brand-negatives/log.json','utf8'))
    console.log(`Shipped: ${log.shippedAt}`)
    console.log(`Removed:`)
    for (const r of log.removed||[]) {
      console.log(`  set=${r.setId} crit=${r.critId} "${r.text}" ${MT[r.mt]}`)
    }
    console.log(`\nGoogle criterion IDs are sequential — these came from a Brand Negatives set`)
    console.log(`Most likely added in same batch since set IDs are similar`)
  }
} catch(e) { console.log('  No snapshot available') }

process.exit(0)
