/**
 * ALL CAMPAIGNS 30d — including paused/enabled/ended.
 * The earlier audit only saw ones with significant spend.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const start = new Date(Date.now() - 30*86400000).toISOString().slice(0, 10)

// All campaigns including those with $0 spend
const rows = await c.query(`
  SELECT campaign.name, campaign.id, campaign.status, campaign.advertising_channel_type,
         campaign_budget.amount_micros,
         metrics.cost_micros, metrics.conversions, metrics.conversions_value,
         metrics.clicks, metrics.impressions, metrics.search_impression_share
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const m = new Map()
for (const r of rows) {
  const k = r.campaign?.name
  const cur = m.get(k) || { id: r.campaign?.id, status: r.campaign?.status, ch: r.campaign?.advertising_channel_type, budget: Number(r.campaign_budget?.amount_micros || 0)/1e6, sp: 0, val: 0, conv: 0, clk: 0, imp: 0, is_n: 0, is_sum: 0 }
  cur.sp += Number(r.metrics?.cost_micros || 0)/1e6
  cur.val += Number(r.metrics?.conversions_value || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.imp += Number(r.metrics?.impressions || 0)
  if (r.metrics?.search_impression_share != null) { cur.is_sum += Number(r.metrics.search_impression_share); cur.is_n++ }
  m.set(k, cur)
}
const sorted = [...m.entries()].sort((a,b) => b[1].sp - a[1].sp)

console.log('\n=== ALL CAMPAIGNS 30d ===\n')
console.log('Status  | Channel | Spend  | Value  | ROAS  | Conv | Clicks | Imp     | IS%   | Budget | Name')
console.log('--------+---------+--------+--------+-------+------+--------+---------+-------+--------+----')
const STATUS = { 2: 'ENABLED', 3: 'PAUSED', 4: 'REMOVED' }
const CHANNEL = { 2: 'SEARCH', 3: 'DISPLAY', 4: 'SHOPPING', 6: 'VIDEO', 13: 'PMAX', 14: 'LOCAL', 7: 'SHOPPING_PMAX' }
for (const [name, x] of sorted) {
  const roas = x.sp > 0 ? (x.val/x.sp).toFixed(2) : '-'
  const is = x.is_n > 0 ? (x.is_sum/x.is_n*100).toFixed(0) : '-'
  console.log(`${(STATUS[x.status]||x.status).padEnd(7)} | ${(CHANNEL[x.ch]||x.ch).toString().padEnd(7)} | $${x.sp.toFixed(0).padStart(5)} | $${x.val.toFixed(0).padStart(5)} | ${(roas+'x').padStart(5)} | ${x.conv.toFixed(0).padStart(4)} | ${x.clk.toString().padStart(6)} | ${x.imp.toString().padStart(7)} | ${is.padStart(4)}% | $${x.budget.toFixed(0).padStart(4)}/d | ${name}`)
}
console.log()
process.exit(0)
