/**
 * Day-by-day PMAX performance Apr 30 → May 14 to pinpoint the breakpoint.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()

const rows = await c.query(`
  SELECT campaign.name, segments.date,
         metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.conversions_value, metrics.impressions
  FROM campaign
  WHERE segments.date BETWEEN '2026-04-25' AND '2026-05-15'
    AND campaign.status = 'ENABLED'
  ORDER BY segments.date
`)

const byDay = new Map()
for (const r of rows) {
  const k = r.segments?.date
  const cur = byDay.get(k) || { clk: 0, conv: 0, sp: 0, val: 0, imp: 0 }
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.val += Number(r.metrics?.conversions_value || 0)
  cur.imp += Number(r.metrics?.impressions || 0)
  byDay.set(k, cur)
}

console.log('\nDate       | Spend | Val   | CVR   | ROAS  | Clicks | Day')
console.log('-----------+-------+-------+-------+-------+--------+----')
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
for (const [d, x] of [...byDay.entries()].sort()) {
  const cvr = x.clk ? (x.conv/x.clk*100).toFixed(1) : '-'
  const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
  const dn = dayNames[new Date(d).getUTCDay()]
  const flag = (x.sp > 0 && x.val/x.sp < 1.5) ? ' 🔴' : ''
  console.log(`${d} | $${x.sp.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${(cvr+'%').padStart(5)} | ${(roas+'x').padStart(5)} | ${x.clk.toString().padStart(5)} | ${dn}${flag}`)
}
process.exit(0)
