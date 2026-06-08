/**
 * Query change_event without filters to see WHO has been making changes to the account
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== WHO MADE CHANGES (last 30 days) ===\n`)

try {
  const events = await c.query(`
    SELECT change_event.change_date_time,
           change_event.user_email,
           change_event.client_type,
           change_event.change_resource_type,
           change_event.resource_change_operation
    FROM change_event
    WHERE change_event.change_date_time DURING LAST_14_DAYS
    ORDER BY change_event.change_date_time ASC
    LIMIT 5000
  `)

  console.log(`Total events in last 30 days: ${events.length}\n`)

  const byUser = {}
  const byUserType = {}
  const byMonth = {}
  for (const e of events) {
    const ev = e.change_event
    const who = ev?.user_email || 'system/automated'
    const month = ev?.change_date_time?.slice(0,7)
    const type = ev?.change_resource_type
    byUser[who] = (byUser[who]||0) + 1
    const key = `${who}|${type}`
    byUserType[key] = (byUserType[key]||0) + 1
    byMonth[month] = (byMonth[month]||0) + 1
  }

  console.log(`--- BY USER ---`)
  for (const [u, c] of Object.entries(byUser).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${u.padEnd(50)} ${c} changes`)
  }

  console.log(`\n--- BY MONTH (last 30 days only available) ---`)
  for (const [m, c] of Object.entries(byMonth).sort()) {
    console.log(`  ${m}: ${c} changes`)
  }

  console.log(`\n--- BY USER × RESOURCE TYPE (top 20) ---`)
  const entries = Object.entries(byUserType).sort((a,b)=>b[1]-a[1]).slice(0,20)
  for (const [k, c] of entries) {
    const [user, type] = k.split('|')
    console.log(`  ${user.padEnd(40)} | ${(type||'?').padEnd(30)} ${c}`)
  }

  // Look for criterion-specific creates
  console.log(`\n--- KEYWORD/CRITERION-RELATED CHANGES ---`)
  const critEvents = events.filter(e => /CRITERION/i.test(e.change_event?.change_resource_type||''))
  console.log(`  ${critEvents.length} criterion-related changes`)
  const critUsers = {}
  for (const e of critEvents) {
    const u = e.change_event?.user_email || 'system'
    critUsers[u] = (critUsers[u]||0)+1
  }
  for (const [u, c] of Object.entries(critUsers).sort((a,b)=>b[1]-a[1])) {
    console.log(`    ${u.padEnd(50)} ${c} changes`)
  }

  // Most recent criterion events
  console.log(`\n--- LAST 15 KEYWORD/CRITERION EVENTS ---`)
  for (const e of critEvents.slice(-15)) {
    const ev = e.change_event
    const op = ev?.resource_change_operation === 2 ? 'CREATE' : ev?.resource_change_operation === 4 ? 'REMOVE' : ev?.resource_change_operation === 3 ? 'UPDATE' : 'OTHER'
    console.log(`  ${ev?.change_date_time?.slice(0,16)} | ${op.padEnd(7)} | ${ev?.change_resource_type?.padEnd(20)} | by: ${ev?.user_email||'system'} | via: ${ev?.client_type||'?'}`)
  }
} catch (e) {
  console.log(`ERR: ${JSON.stringify(e?.errors?.[0]||e?.message)?.slice(0,400)}`)
}

process.exit(0)
