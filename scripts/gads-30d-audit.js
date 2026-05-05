/**
 * 30-day audit — Mon framework checkpoint
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const fmt = (d) => d.toISOString().slice(0, 10)
const today = new Date()
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d) }

const start30 = daysAgo(30)
const end = daysAgo(0)

console.log(`\n=== 30-DAY AUDIT — ${end} ===`)
console.log(`Window: ${start30} → ${end}\n`)

const rows = await customer.query(`
  SELECT campaign.name, campaign.id, campaign.status, campaign_budget.amount_micros,
         metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${start30}' AND '${end}'
`)

const byCamp = new Map()
for (const r of rows) {
  const name = r.campaign?.name || '?'
  const cur = byCamp.get(name) || { id: r.campaign?.id, status: r.campaign?.status, budget: Number(r.campaign_budget?.amount_micros || 0) / 1e6, spend: 0, clicks: 0, conv: 0, val: 0 }
  cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.clicks += Number(r.metrics?.clicks || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.val += Number(r.metrics?.conversions_value || 0)
  byCamp.set(name, cur)
}

let totSpend = 0, totVal = 0
const sorted = [...byCamp.entries()].sort((a, b) => b[1].spend - a[1].spend)
console.log('--- 30D PER-CAMPAIGN ---')
for (const [name, x] of sorted) {
  if (x.spend < 1) continue
  totSpend += x.spend; totVal += x.val
  const roas = x.spend > 0 ? (x.val / x.spend).toFixed(2) : '-'
  const cpa = x.conv > 0 ? (x.spend / x.conv).toFixed(2) : '-'
  console.log(`  ${name}`)
  console.log(`    ID ${x.id} | Status ${x.status} | Budget $${x.budget}/d`)
  console.log(`    30d: $${x.spend.toFixed(0)} spend | ${x.conv.toFixed(1)} conv | $${x.val.toFixed(0)} value | ${roas}x ROAS | $${cpa} CPA`)
}
const accRoas = totSpend > 0 ? (totVal / totSpend).toFixed(2) : '-'
console.log(`\n  TOTAL 30d: $${totSpend.toFixed(0)} | $${totVal.toFixed(0)} value | ${accRoas}x ROAS\n`)

// Today so far
const todayRows = await customer.query(`
  SELECT campaign.name, metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date = '${end}'
`)
console.log(`--- TODAY ${end} (so far) ---`)
let tSpend = 0, tVal = 0, tConv = 0
for (const r of todayRows) {
  const spend = Number(r.metrics?.cost_micros || 0) / 1e6
  const val = Number(r.metrics?.conversions_value || 0)
  const conv = Number(r.metrics?.conversions || 0)
  tSpend += spend; tVal += val; tConv += conv
  if (spend > 0) {
    const roas = spend > 0 ? (val / spend).toFixed(2) : '-'
    console.log(`  ${r.campaign?.name}: $${spend.toFixed(2)} | ${conv.toFixed(1)} conv | $${val.toFixed(0)} | ${roas}x`)
  }
}
console.log(`  TODAY TOTAL: $${tSpend.toFixed(2)} | ${tConv.toFixed(1)} conv | $${tVal.toFixed(0)} | ${tSpend > 0 ? (tVal/tSpend).toFixed(2) : '-'}x\n`)

process.exit(0)
