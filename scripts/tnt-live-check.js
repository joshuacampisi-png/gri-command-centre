import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const today = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-7*86400000).toISOString().slice(0,10)

console.log(`\n=== IS TNT SERVING IN PMAX ALL PRODUCTS RIGHT NOW? ===\n`)
console.log(`Window: ${start} → ${today}\n`)

// Pull TNT impressions in PMAX All Products (id 21113841118) last 7 days
const rows = await c.query(`
  SELECT campaign.id, campaign.name, segments.date, segments.product_item_id, segments.product_title,
         metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE campaign.id=21113841118
    AND segments.date BETWEEN '${start}' AND '${today}'
`)

const byDay = new Map()
let totalImp=0, totalSp=0, totalConv=0, totalVal=0
for (const r of rows) {
  const title = r.segments?.productTitle || r.segments?.product_title || ''
  if (!/TNT/i.test(title)) continue
  const d = r.segments?.date
  const cur = byDay.get(d) || { imp:0, clk:0, sp:0, conv:0, val:0 }
  cur.imp += Number(r.metrics?.impressions||0)
  cur.clk += Number(r.metrics?.clicks||0)
  cur.sp += Number(r.metrics?.cost_micros||0)/1e6
  cur.conv += Number(r.metrics?.conversions||0)
  cur.val += Number(r.metrics?.conversions_value||0)
  byDay.set(d, cur)
  totalImp += Number(r.metrics?.impressions||0)
  totalSp += Number(r.metrics?.cost_micros||0)/1e6
  totalConv += Number(r.metrics?.conversions||0)
  totalVal += Number(r.metrics?.conversions_value||0)
}

console.log('Date       | Imp   | Clk | Spend | Conv | Value | ROAS')
for (const [d,x] of [...byDay.entries()].sort()) {
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`${d} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${roas}x`)
}
console.log(`\n7-DAY TOTAL: ${totalImp}imp $${totalSp.toFixed(0)} ${totalConv.toFixed(0)}c $${totalVal.toFixed(0)} val | ${totalSp?(totalVal/totalSp).toFixed(2):'-'}x ROAS`)

if (totalImp > 0) console.log(`\n✅ YES — TNT is actively serving inside PMAX All Products`)
else console.log(`\n❌ TNT is NOT serving (0 impressions last 7 days)`)
process.exit(0)
