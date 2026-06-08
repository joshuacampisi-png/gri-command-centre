import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-180*86400000).toISOString().slice(0,10)

const PAUSED_AGS = [
  { id:6493809429, name:'Reveal Cannons' },
  { id:6500161224, name:'Extreme Powder Reveals' },
  { id:6500169557, name:'Sports Reveals' },
  { id:6500169710, name:'Balloon Kits' },
  { id:6514798581, name:'High ROAS Products' },
  { id:6529479125, name:'NEW | All Products - Custom Segments' },
  { id:6549626172, name:'Baby Shower' },
  { id:6564888374, name:'All Products | Targeting Test' },
]

console.log(`\n=== PAUSED ASSET GROUPS — 180-day historical performance ===\n`)
console.log('Asset Group                            | Total Imp | Spend   | Conv | Revenue | ROAS   | Last Active')
console.log('---------------------------------------+-----------+---------+------+---------+--------+------------')
for (const ag of PAUSED_AGS) {
  const r = await c.query(`SELECT asset_group.id, segments.date, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM asset_group WHERE asset_group.id=${ag.id} AND segments.date BETWEEN '${start}' AND '${end}'`)
  let imp=0,sp=0,conv=0,val=0
  let lastDate = null
  for (const row of r) {
    const i = Number(row.metrics?.impressions||0)
    if (i===0) continue
    imp+=i
    sp+=Number(row.metrics?.cost_micros||0)/1e6
    conv+=Number(row.metrics?.conversions||0)
    val+=Number(row.metrics?.conversions_value||0)
    if (!lastDate || row.segments?.date > lastDate) lastDate = row.segments?.date
  }
  const roas = sp?(val/sp).toFixed(2):'-'
  console.log(`${ag.name.slice(0,38).padEnd(38)} | ${String(imp).padStart(9)} | $${sp.toFixed(0).padStart(6)} | ${conv.toFixed(0).padStart(4)} | $${val.toFixed(0).padStart(6)} | ${String(roas).padStart(5)}x | ${lastDate||'never'}`)
}

// Also check current budget vs spend for the All Products campaign
console.log(`\n=== CAMPAIGN BUDGET vs SPEND ===`)
const cs = await c.query(`SELECT campaign.id, campaign.name, campaign_budget.amount_micros FROM campaign WHERE campaign.status='ENABLED'`)
for (const r of cs) {
  console.log(`  ${r.campaign?.name?.padEnd(38)} | $${Number(r.campaign_budget?.amount_micros||0)/1e6}/day cap`)
}

// Recent daily spend on All Products
const sp7 = await c.query(`SELECT segments.date, metrics.cost_micros FROM campaign WHERE campaign.id=21113841118 AND segments.date BETWEEN '${new Date(Date.now()-7*86400000).toISOString().slice(0,10)}' AND '${end}' ORDER BY segments.date`)
console.log(`\nAll Products daily spend last 7 days:`)
let sumSp = 0
for (const r of sp7) {
  const s = Number(r.metrics?.cost_micros||0)/1e6
  sumSp+=s
  console.log(`  ${r.segments?.date}: $${s.toFixed(0)}`)
}
console.log(`  7-day avg: $${(sumSp/7).toFixed(0)}/day`)
process.exit(0)
