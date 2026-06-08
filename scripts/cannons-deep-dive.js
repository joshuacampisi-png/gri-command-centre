import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const CAMP = 21094179575
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-30*86400000).toISOString().slice(0,10)

console.log(`\n=== GRI | SEARCH | CANNONS — 30-DAY DEEP DIVE ===`)
console.log(`Window: ${start} → ${end}\n`)

// 1. Daily performance
console.log('--- 1. DAILY PERFORMANCE (30 days) ---')
const daily = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.search_impression_share FROM campaign WHERE campaign.id=${CAMP} AND segments.date BETWEEN '${start}' AND '${end}' ORDER BY segments.date`)
let tImp=0,tClk=0,tSp=0,tConv=0,tVal=0
console.log('Date       | Imp | Clk | Spend | CTR  | CPC   | Conv | Value | CVR  | ROAS | IS%')
for (const r of daily) {
  const imp=Number(r.metrics?.impressions||0)
  if (imp===0 && Number(r.metrics?.cost_micros||0)===0) continue
  const clk=Number(r.metrics?.clicks||0)
  const sp=Number(r.metrics?.cost_micros||0)/1e6
  const conv=Number(r.metrics?.conversions||0)
  const val=Number(r.metrics?.conversions_value||0)
  const is=r.metrics?.search_impression_share!=null?(Number(r.metrics.search_impression_share)*100).toFixed(0):'-'
  tImp+=imp; tClk+=clk; tSp+=sp; tConv+=conv; tVal+=val
  const ctr = imp?(clk/imp*100).toFixed(1):'-'
  const cpc = clk?(sp/clk).toFixed(2):'-'
  const cvr = clk?(conv/clk*100).toFixed(1):'-'
  const roas = sp?(val/sp).toFixed(2):'-'
  console.log(`${r.segments?.date} | ${String(imp).padStart(3)} | ${String(clk).padStart(3)} | $${sp.toFixed(0).padStart(4)} | ${ctr.padStart(4)}% | $${cpc.padStart(4)} | ${conv.toFixed(0).padStart(4)} | $${val.toFixed(0).padStart(4)} | ${cvr}% | ${roas}x | ${is}%`)
}
console.log(`-- 30-DAY TOTAL: ${tImp}imp ${tClk}clk $${tSp.toFixed(0)} | ${tConv.toFixed(0)}c $${tVal.toFixed(0)} val | CTR ${(tClk/tImp*100).toFixed(1)}% CVR ${(tConv/tClk*100).toFixed(1)}% ROAS ${(tVal/tSp).toFixed(2)}x`)

// 2. Keyword-level performance (30d)
console.log(`\n--- 2. KEYWORDS (30d) ---`)
const kw = await c.query(`SELECT campaign.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM keyword_view WHERE campaign.id=${CAMP} AND segments.date BETWEEN '${start}' AND '${end}'`)
const m = new Map()
for (const r of kw) {
  const k = `${r.ad_group_criterion?.keyword?.text}|${r.ad_group_criterion?.keyword?.match_type}`
  const cur = m.get(k) || { text:r.ad_group_criterion?.keyword?.text, mt:r.ad_group_criterion?.keyword?.match_type, status:r.ad_group_criterion?.status, imp:0, clk:0, sp:0, conv:0, val:0 }
  cur.imp+=Number(r.metrics?.impressions||0)
  cur.clk+=Number(r.metrics?.clicks||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+=Number(r.metrics?.conversions||0)
  cur.val+=Number(r.metrics?.conversions_value||0)
  m.set(k, cur)
}
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}
const ST = {2:'ENABLED',3:'PAUSED'}
console.log('[Status] [Match]  Keyword                              | Imp  | Clk | Spend | Conv | Value | CVR  | ROAS')
for (const x of [...m.values()].sort((a,b)=>b.sp-a.sp)) {
  if (x.imp===0 && x.sp===0) continue
  const cvr=x.clk?(x.conv/x.clk*100).toFixed(1):'-'
  const roas=x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`[${ST[x.status]||x.status}] [${(MT[x.mt]||x.mt).padEnd(6)}] ${(x.text||'').padEnd(36)} | ${String(x.imp).padStart(4)} | ${String(x.clk).padStart(3)} | $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${cvr}% | ${roas}x`)
}

// 3. Search terms (visible only — Google redacts the rest)
console.log(`\n--- 3. SEARCH TERMS (visible, 30d) ---`)
const st = await c.query(`SELECT campaign.id, search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM search_term_view WHERE campaign.id=${CAMP} AND segments.date BETWEEN '${start}' AND '${end}' AND metrics.impressions > 0`)
console.log(`Visible search terms: ${st.length}`)
const sortedSt = st.map(r => ({
  term: r.search_term_view?.search_term,
  imp:Number(r.metrics?.impressions||0),
  clk:Number(r.metrics?.clicks||0),
  sp:Number(r.metrics?.cost_micros||0)/1e6,
  conv:Number(r.metrics?.conversions||0),
  val:Number(r.metrics?.conversions_value||0)
})).sort((a,b)=>b.sp-a.sp)
console.log('Search Term                                   | Imp | Clk | Spend | Conv | Value | CVR  | ROAS')
for (const x of sortedSt.slice(0,20)) {
  const cvr=x.clk?(x.conv/x.clk*100).toFixed(1):'-'
  const roas=x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`${(x.term||'').slice(0,45).padEnd(45)} | ${String(x.imp).padStart(3)} | ${String(x.clk).padStart(3)} | $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0)} | $${x.val.toFixed(0).padStart(4)} | ${cvr}% | ${roas}x`)
}

// 4. Compare to prior 30 days (60-30 days ago)
console.log(`\n--- 4. CURRENT 30d vs PRIOR 30d (is this a new problem?) ---`)
const priorStart = new Date(Date.now()-60*86400000).toISOString().slice(0,10)
const priorEnd = new Date(Date.now()-31*86400000).toISOString().slice(0,10)
const periodSum = async (s,e) => {
  const r = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id=${CAMP} AND segments.date BETWEEN '${s}' AND '${e}'`)
  let i=0,cl=0,sp=0,co=0,v=0
  for (const x of r) { i+=Number(x.metrics?.impressions||0); cl+=Number(x.metrics?.clicks||0); sp+=Number(x.metrics?.cost_micros||0)/1e6; co+=Number(x.metrics?.conversions||0); v+=Number(x.metrics?.conversions_value||0) }
  return {i,cl,sp,co,v}
}
const cur = await periodSum(start, end)
const pri = await periodSum(priorStart, priorEnd)
console.log(`Current 30d (${start}→${end}): ${cur.i}imp ${cur.cl}clk $${cur.sp.toFixed(0)} ${cur.co.toFixed(0)}c $${cur.v.toFixed(0)} | ROAS ${cur.sp?(cur.v/cur.sp).toFixed(2):'-'}x CVR ${cur.cl?(cur.co/cur.cl*100).toFixed(1):'-'}%`)
console.log(`Prior 30d   (${priorStart}→${priorEnd}): ${pri.i}imp ${pri.cl}clk $${pri.sp.toFixed(0)} ${pri.co.toFixed(0)}c $${pri.v.toFixed(0)} | ROAS ${pri.sp?(pri.v/pri.sp).toFixed(2):'-'}x CVR ${pri.cl?(pri.co/pri.cl*100).toFixed(1):'-'}%`)

process.exit(0)
