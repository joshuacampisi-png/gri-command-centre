import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const CAMP_ID = 23425232813
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-730*86400000).toISOString().slice(0,10)

console.log(`\n=== GRI Brand Defence — Historical Performance (${start} → ${end}) ===\n`)
const rows = await c.query(`
  SELECT segments.month, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value, metrics.all_conversions, metrics.all_conversions_value
  FROM campaign
  WHERE campaign.id = ${CAMP_ID} AND segments.date BETWEEN '${start}' AND '${end}'
  ORDER BY segments.month ASC
`)

let tImp=0,tClk=0,tSp=0,tConv=0,tVal=0,tAllConv=0,tAllVal=0
const months = []
for (const r of rows) {
  const imp = Number(r.metrics?.impressions||0)
  if (imp === 0) continue
  const clk = Number(r.metrics?.clicks||0)
  const sp = Number(r.metrics?.cost_micros||0)/1e6
  const conv = Number(r.metrics?.conversions||0)
  const val = Number(r.metrics?.conversions_value||0)
  const allConv = Number(r.metrics?.all_conversions||0)
  const allVal = Number(r.metrics?.all_conversions_value||0)
  tImp+=imp; tClk+=clk; tSp+=sp; tConv+=conv; tVal+=val; tAllConv+=allConv; tAllVal+=allVal
  months.push({month: r.segments?.month, imp, clk, sp, conv, val, allConv, allVal})
}

console.log('Month       | Imp    | Clk  | Spend  | LC Conv | LC Value | LC ROAS | AllConv | AllValue | All ROAS | CPC   | CVR  ')
console.log('------------+--------+------+--------+---------+----------+---------+---------+----------+----------+-------+-------')
for (const m of months) {
  const lc_roas = m.sp ? (m.val/m.sp).toFixed(2) : '-'
  const all_roas = m.sp ? (m.allVal/m.sp).toFixed(2) : '-'
  const cpc = m.clk ? (m.sp/m.clk).toFixed(2) : '-'
  const cvr = m.clk ? (m.conv/m.clk*100).toFixed(1) : '-'
  console.log(`${m.month?.slice(0,10)} | ${String(m.imp).padStart(6)} | ${String(m.clk).padStart(4)} | $${m.sp.toFixed(0).padStart(5)} | ${m.conv.toFixed(1).padStart(7)} | $${m.val.toFixed(0).padStart(7)} | ${lc_roas.padStart(6)}x | ${m.allConv.toFixed(1).padStart(7)} | $${m.allVal.toFixed(0).padStart(7)} | ${all_roas.padStart(7)}x | $${cpc.padStart(4)} | ${cvr.padStart(4)}%`)
}
console.log('------------+--------+------+--------+---------+----------+---------+---------+----------+----------+-------+-------')
const totLcRoas = tSp ? (tVal/tSp).toFixed(2) : '-'
const totAllRoas = tSp ? (tAllVal/tSp).toFixed(2) : '-'
console.log(`TOTAL       | ${String(tImp).padStart(6)} | ${String(tClk).padStart(4)} | $${tSp.toFixed(0).padStart(5)} | ${tConv.toFixed(1).padStart(7)} | $${tVal.toFixed(0).padStart(7)} | ${totLcRoas.padStart(6)}x | ${tAllConv.toFixed(1).padStart(7)} | $${tAllVal.toFixed(0).padStart(7)} | ${totAllRoas.padStart(7)}x`)
console.log(`\nMonths with data: ${months.length} | Active period: ${months[0]?.month?.slice(0,7)} → ${months[months.length-1]?.month?.slice(0,7)}`)
console.log(`Avg monthly spend: $${(tSp/Math.max(months.length,1)).toFixed(0)}`)
console.log(`Avg monthly revenue (last-click): $${(tVal/Math.max(months.length,1)).toFixed(0)}`)
console.log(`Lifetime LC ROAS: ${totLcRoas}x | Lifetime AllConv ROAS: ${totAllRoas}x`)
process.exit(0)
