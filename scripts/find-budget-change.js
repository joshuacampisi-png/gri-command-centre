/**
 * Find the EXACT budget + campaign-level changes in last 14 days
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()

const strCh = c => typeof c === 'string' ? c : (c?.name || String(c||''))

console.log('\n=== ALL CHANGE EVENTS LAST 14 DAYS ===\n')

const ch = await customer.query(`
  SELECT change_event.change_date_time, change_event.user_email,
         change_event.change_resource_type, change_event.resource_change_operation,
         change_event.client_type, change_event.campaign,
         change_event.old_resource, change_event.new_resource,
         change_event.changed_fields,
         campaign.name, campaign_budget.id, campaign_budget.amount_micros
  FROM change_event
  WHERE change_event.change_date_time DURING LAST_14_DAYS
  ORDER BY change_event.change_date_time DESC
  LIMIT 100
`)

console.log(`Total change events: ${ch.length}\n`)

// Filter to budget + campaign changes
console.log('=== BUDGET CHANGES (resource_type = CAMPAIGN_BUDGET) ===\n')
const budgetChanges = ch.filter(c => {
  const t = strCh(c.change_event?.change_resource_type)
  return t === 'CAMPAIGN_BUDGET' || t === '6'
})
if (!budgetChanges.length) console.log('  (none found — checking by numeric type 6)')
for (const c of budgetChanges) {
  console.log(`  ${c.change_event?.change_date_time}`)
  console.log(`    Campaign: ${c.campaign?.name || '(unknown)'}`)
  console.log(`    Op: ${strCh(c.change_event?.resource_change_operation)}`)
  console.log(`    User: ${c.change_event?.user_email}`)
  console.log(`    Client: ${strCh(c.change_event?.client_type)}`)
  console.log(`    Changed fields: ${JSON.stringify(c.change_event?.changed_fields)}`)
  console.log(`    Old: ${JSON.stringify(c.change_event?.old_resource).slice(0,500)}`)
  console.log(`    New: ${JSON.stringify(c.change_event?.new_resource).slice(0,500)}`)
  console.log('')
}

console.log('\n=== CAMPAIGN-LEVEL SETTING CHANGES (type 5 / CAMPAIGN) ===\n')
const campChanges = ch.filter(c => {
  const t = strCh(c.change_event?.change_resource_type)
  return t === 'CAMPAIGN' || t === '5'
})
for (const c of campChanges.slice(0,20)) {
  const dt = c.change_event?.change_date_time?.slice(0,16)
  const op = strCh(c.change_event?.resource_change_operation)
  console.log(`  ${dt} | ${op.padEnd(7)} | ${c.campaign?.name?.slice(0,40).padEnd(40) || '(unknown)'} | by ${c.change_event?.user_email?.slice(0,30)}`)
  if (c.change_event?.changed_fields) console.log(`    Fields: ${JSON.stringify(c.change_event.changed_fields).slice(0,200)}`)
}

// Now check actual current vs historical campaign budgets via a different query
console.log('\n=== CURRENT CAMPAIGN BUDGETS (per active campaign) ===\n')
const budgetRows = await customer.query(`
  SELECT campaign.name, campaign_budget.amount_micros, campaign_budget.delivery_method, campaign.status
  FROM campaign
  WHERE campaign.status != 'REMOVED'
`)
const seen = new Set()
for (const r of budgetRows) {
  const n = r.campaign?.name
  if (seen.has(n)) continue
  seen.add(n)
  const budget = Number(r.campaign_budget?.amount_micros||0)/1e6
  console.log(`  ${n.padEnd(40)} | $${budget.toFixed(2)}/day | status: ${r.campaign?.status} | delivery: ${strCh(r.campaign_budget?.delivery_method)}`)
}

process.exit(0)
