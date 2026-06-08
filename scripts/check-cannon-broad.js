import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const CAMP = 21094179575

// Find "gender reveal cannon" BROAD and pull its daily history
const kw = await c.query(`SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status FROM ad_group_criterion WHERE campaign.id=${CAMP} AND ad_group_criterion.keyword.text='gender reveal cannon' AND ad_group_criterion.type='KEYWORD'`)
console.log(`\n=== "gender reveal cannon" keyword variants ===`)
for (const r of kw) {
  const mt = r.ad_group_criterion?.keyword?.match_type
  const st = r.ad_group_criterion?.status
  console.log(`  match=${mt===2?'EXACT':mt===3?'PHRASE':mt===4?'BROAD':mt} status=${st===2?'ENABLED':st===3?'PAUSED':st} crit_id=${r.ad_group_criterion?.criterion_id} ag=${r.ad_group?.id}`)
}

const broad = kw.find(r => r.ad_group_criterion?.keyword?.match_type === 4)
if (!broad) { console.log('No BROAD found'); process.exit(0) }

const critId = broad.ad_group_criterion?.criterion_id
const agId = broad.ad_group?.id
console.log(`\n=== "gender reveal cannon" BROAD — 90-day daily history (when last active) ===`)
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-90*86400000).toISOString().slice(0,10)
const daily = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM keyword_view WHERE ad_group_criterion.criterion_id=${critId} AND ad_group.id=${agId} AND segments.date BETWEEN '${start}' AND '${end}' ORDER BY segments.date`)
console.log('Date       | Imp | Clk | Spend | Conv | Value | ROAS')
let lastActive = null
let tImp=0,tSp=0,tConv=0,tVal=0
for (const r of daily) {
  const imp = Number(r.metrics?.impressions||0)
  if (imp===0) continue
  const sp = Number(r.metrics?.cost_micros||0)/1e6
  const clk = Number(r.metrics?.clicks||0)
  const conv = Number(r.metrics?.conversions||0)
  const val = Number(r.metrics?.conversions_value||0)
  const roas = sp?(val/sp).toFixed(2):'-'
  tImp+=imp; tSp+=sp; tConv+=conv; tVal+=val
  lastActive = r.segments?.date
  console.log(`${r.segments?.date} | ${String(imp).padStart(3)} | ${String(clk).padStart(3)} | $${sp.toFixed(0).padStart(4)} | ${conv.toFixed(0).padStart(4)} | $${val.toFixed(0).padStart(4)} | ${roas}x`)
}
console.log(`\nLAST DAY WITH IMPRESSIONS: ${lastActive||'never'}`)
console.log(`90d TOTAL: ${tImp}imp $${tSp.toFixed(0)} | ${tConv.toFixed(0)}c $${tVal.toFixed(0)} | ${tSp?(tVal/tSp).toFixed(2):'-'}x ROAS`)
process.exit(0)
