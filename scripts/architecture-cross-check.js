import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-365*86400000).toISOString().slice(0,10)

// All campaigns including paused
const camps = await c.query(`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign`)
const STATUS = {2:'ENABLED',3:'PAUSED',4:'REMOVED'}
const CHAN = {2:'Search',7:'Display',10:'PMAX',14:'Demand Gen',8:'Video'}

console.log(`\n=== ARCHITECTURE CROSS-CHECK — HISTORICAL PERFORMANCE OF EACH CAMPAIGN ===\n`)
console.log('Campaign                                       | Status  | Lifetime Spend | Conv | Revenue | ROAS  | Last Active')
console.log('-----------------------------------------------+---------+----------------+------+---------+-------+------------')

const results = []
for (const r of camps) {
  const id = r.campaign?.id
  const name = r.campaign?.name||'?'
  const status = STATUS[r.campaign?.status]||r.campaign?.status

  // Get lifetime performance (last 365 days)
  const perf = await c.query(`SELECT segments.month, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id=${id} AND segments.date BETWEEN '${start}' AND '${end}'`)
  let totalSp=0, totalConv=0, totalVal=0, lastMonth=null, monthsActive=0
  for (const p of perf) {
    const sp=Number(p.metrics?.cost_micros||0)/1e6
    if (sp===0 && !Number(p.metrics?.conversions||0)) continue
    totalSp+=sp
    totalConv+=Number(p.metrics?.conversions||0)
    totalVal+=Number(p.metrics?.conversions_value||0)
    if (!lastMonth || p.segments?.month > lastMonth) lastMonth = p.segments?.month
    monthsActive++
  }
  const roas = totalSp ? (totalVal/totalSp).toFixed(2) : '-'
  results.push({ name, status, totalSp, totalConv, totalVal, roas, lastMonth, monthsActive })
}

// Sort by lifetime spend
results.sort((a,b)=>b.totalSp-a.totalSp)
for (const r of results) {
  if (r.totalSp===0 && r.totalConv===0) continue
  console.log(`${r.name.slice(0,46).padEnd(46)} | ${r.status.padEnd(7)} | $${r.totalSp.toFixed(0).padStart(13)} | ${r.totalConv.toFixed(0).padStart(4)} | $${r.totalVal.toFixed(0).padStart(6)} | ${r.roas.padStart(5)}x | ${(r.lastMonth||'never').slice(0,10)}`)
}

// Show campaigns with zero history
console.log(`\nCampaigns with NO activity in last 365 days:`)
for (const r of results) {
  if (r.totalSp===0 && r.totalConv===0) console.log(`  [${r.status}] ${r.name}`)
}

process.exit(0)
