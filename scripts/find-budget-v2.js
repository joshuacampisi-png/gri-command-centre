/**
 * Split into two queries — change_event AND budgets separately
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const strCh = c => typeof c === 'string' ? c : (c?.name || String(c||''))

// Query 1: change_event with campaign info only (no budget cross-join)
const ch = await customer.query(`
  SELECT change_event.change_date_time, change_event.user_email,
         change_event.change_resource_type, change_event.resource_change_operation,
         change_event.client_type, change_event.campaign,
         change_event.old_resource, change_event.new_resource,
         change_event.changed_fields,
         campaign.name
  FROM change_event
  WHERE change_event.change_date_time DURING LAST_14_DAYS
  ORDER BY change_event.change_date_time DESC
  LIMIT 100
`)
console.log(`Total events: ${ch.length}\n`)

// Group by resource type
const byType = new Map()
for (const c of ch) {
  const t = strCh(c.change_event?.change_resource_type)
  if (!byType.has(t)) byType.set(t, [])
  byType.get(t).push(c)
}
console.log('=== BY RESOURCE TYPE ===')
for (const [t, list] of [...byType.entries()].sort((a,b)=>b[1].length-a[1].length)) {
  console.log(`  Type ${t}: ${list.length} events`)
}

// Show the campaign + budget ones
console.log('\n=== CAMPAIGN + BUDGET CHANGES (detail) ===\n')
for (const c of ch) {
  const t = strCh(c.change_event?.change_resource_type)
  if (t !== 'CAMPAIGN_BUDGET' && t !== '6' && t !== 'CAMPAIGN' && t !== '5') continue
  const dt = c.change_event?.change_date_time?.slice(0,16)
  const op = strCh(c.change_event?.resource_change_operation)
  const camp = c.campaign?.name || '(unknown)'
  console.log(`${dt} | TYPE=${t} | OP=${op} | CAMP=${camp.slice(0,40)}`)
  if (c.change_event?.changed_fields) {
    const fields = c.change_event.changed_fields
    console.log(`  Fields: ${JSON.stringify(fields).slice(0,300)}`)
  }
  if (c.change_event?.old_resource) {
    const old = typeof c.change_event.old_resource === 'string' ? c.change_event.old_resource : JSON.stringify(c.change_event.old_resource)
    console.log(`  OLD:    ${old.slice(0,400)}`)
  }
  if (c.change_event?.new_resource) {
    const nw = typeof c.change_event.new_resource === 'string' ? c.change_event.new_resource : JSON.stringify(c.change_event.new_resource)
    console.log(`  NEW:    ${nw.slice(0,400)}`)
  }
  console.log('')
}

// Query 2: current budgets
console.log('\n=== CURRENT BUDGETS ===\n')
const budgets = await customer.query(`
  SELECT campaign.name, campaign.status, campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.status != 'REMOVED'
`)
const seen = new Set()
for (const r of budgets) {
  const n = r.campaign?.name
  if (!n || seen.has(n)) continue
  seen.add(n)
  const b = Number(r.campaign_budget?.amount_micros||0)/1e6
  console.log(`  ${n.padEnd(40)} | $${b.toFixed(2)}/day | ${strCh(r.campaign?.status)}`)
}
process.exit(0)
