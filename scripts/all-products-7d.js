import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const start = new Date(Date.now()-7*86400000).toISOString().slice(0,10)
const end = new Date(Date.now()-1*86400000).toISOString().slice(0,10) // exclude today partial

console.log(`\n=== PMAX | All Products — 7-DAY METRICS (${start} → ${end}) ===\n`)
const rows = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE campaign.id=21113841118 AND segments.date BETWEEN '${start}' AND '${end}' ORDER BY segments.date`)
let tImp=0,tClk=0,tSp=0,tConv=0,tVal=0
let bgtLossSum=0, rnkLossSum=0, isSum=0, n=0
console.log('Date       | Imp   | Clk | Spend | Conv | Value  | ROAS | CVR  | AOV  | IS%  | BgtLoss% | RnkLoss%')
for (const r of rows) {
  const imp=Number(r.metrics?.impressions||0), clk=Number(r.metrics?.clicks||0)
  const sp=Number(r.metrics?.cost_micros||0)/1e6, conv=Number(r.metrics?.conversions||0), val=Number(r.metrics?.conversions_value||0)
  tImp+=imp; tClk+=clk; tSp+=sp; tConv+=conv; tVal+=val
  const is=r.metrics?.search_impression_share!=null?Number(r.metrics.search_impression_share)*100:null
  const bgt=r.metrics?.search_budget_lost_impression_share!=null?Number(r.metrics.search_budget_lost_impression_share)*100:null
  const rnk=r.metrics?.search_rank_lost_impression_share!=null?Number(r.metrics.search_rank_lost_impression_share)*100:null
  if (is!=null) { isSum+=is; n++ }
  if (bgt!=null) bgtLossSum+=bgt
  if (rnk!=null) rnkLossSum+=rnk
  const roas=sp?(val/sp).toFixed(2):'-'
  const cvr=clk?(conv/clk*100).toFixed(1):'-'
  const aov=conv?(val/conv).toFixed(0):'-'
  console.log(`${r.segments?.date} | ${String(imp).padStart(5)} | ${String(clk).padStart(3)} | $${sp.toFixed(0).padStart(4)} | ${conv.toFixed(0).padStart(4)} | $${val.toFixed(0).padStart(5)} | ${String(roas).padStart(4)}x | ${String(cvr).padStart(4)}% | ${aov?'$'+aov:'-'} | ${is!=null?is.toFixed(0)+'%':'-'} | ${bgt!=null?bgt.toFixed(0)+'%':'-'} | ${rnk!=null?rnk.toFixed(0)+'%':'-'}`)
}
console.log(`\n=== 7-DAY TOTALS ===`)
const cvr = tClk?(tConv/tClk*100).toFixed(2):'-'
const aov = tConv?(tVal/tConv).toFixed(0):'-'
const roas = tSp?(tVal/tSp).toFixed(2):'-'
console.log(`Imp: ${tImp.toLocaleString()} | Clk: ${tClk} | Spend: $${tSp.toFixed(0)} | Conv: ${tConv.toFixed(0)} | Value: $${tVal.toFixed(0)}`)
console.log(`CTR: ${(tClk/tImp*100).toFixed(2)}% | CVR: ${cvr}% | AOV: $${aov} | ROAS: ${roas}x`)
console.log(`Avg IS: ${n?(isSum/n).toFixed(0):'-'}% | Avg Budget-Lost IS: ${n?(bgtLossSum/n).toFixed(0):'-'}% | Avg Rank-Lost IS: ${n?(rnkLossSum/n).toFixed(0):'-'}%`)
console.log(`Daily avg spend: $${(tSp/7).toFixed(0)} | Daily avg conv: ${(tConv/7).toFixed(1)} | Daily avg revenue: $${(tVal/7).toFixed(0)}`)
process.exit(0)
