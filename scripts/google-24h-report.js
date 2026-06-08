/**
 * 24h Google account report — fresh API pull
 * Yesterday full day vs day-before vs 7d avg
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))
const pct = (a,b) => b===0?'—':(((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'

console.log(`\n=== 24h GOOGLE REPORT — ${new Date().toISOString().slice(0,16)} ===\n`)

async function fetchDay(start, end) {
  return c.query(`
    SELECT segments.date, campaign.name, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.all_conversions, metrics.all_conversions_value,
           metrics.search_impression_share, metrics.search_top_impression_share,
           metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)
}

// Yesterday = Jun 2 full day, Today = Jun 3 partial, 7-day baseline = May 27 - Jun 2
const YDAY = '2026-06-02'
const TODAY = '2026-06-03'
const BASE_START = '2026-05-27'
const BASE_END = '2026-06-02'

const [yday, today, baseline] = await Promise.all([
  fetchDay(YDAY, YDAY),
  fetchDay(TODAY, TODAY),
  fetchDay(BASE_START, BASE_END),
])

const agg = rows => {
  const t = {imp:0,clk:0,spend:0,conv:0,val:0,allConv:0,allVal:0,is:[],lb:[],lr:[],top:[]}
  const byCamp = new Map()
  const dates = new Set()
  for (const r of rows) {
    dates.add(r.segments?.date)
    const m = r.metrics
    const sp = Number(m?.cost_micros||0)/1e6
    t.imp += Number(m?.impressions||0)
    t.clk += Number(m?.clicks||0)
    t.spend += sp
    t.conv += Number(m?.conversions||0)
    t.val += Number(m?.conversions_value||0)
    t.allConv += Number(m?.all_conversions||0)
    t.allVal += Number(m?.all_conversions_value||0)
    if (m?.search_impression_share!=null) t.is.push(Number(m.search_impression_share))
    if (m?.search_budget_lost_impression_share!=null) t.lb.push(Number(m.search_budget_lost_impression_share))
    if (m?.search_rank_lost_impression_share!=null) t.lr.push(Number(m.search_rank_lost_impression_share))
    if (m?.search_top_impression_share!=null) t.top.push(Number(m.search_top_impression_share))
    const cn = r.campaign?.name||'?'
    if (!byCamp.has(cn)) byCamp.set(cn, {imp:0,clk:0,spend:0,conv:0,val:0,allVal:0})
    const c = byCamp.get(cn)
    c.imp += Number(m?.impressions||0); c.clk += Number(m?.clicks||0); c.spend += sp
    c.conv += Number(m?.conversions||0); c.val += Number(m?.conversions_value||0)
    c.allVal += Number(m?.all_conversions_value||0)
  }
  t.days = dates.size
  t.byCamp = byCamp
  return t
}

const Y = agg(yday)
const T = agg(today)
const B = agg(baseline)
const baseDays = B.days || 1
const baseAvg = {
  spend: B.spend/baseDays, imp: B.imp/baseDays, clk: B.clk/baseDays,
  conv: B.conv/baseDays, val: B.val/baseDays, allVal: B.allVal/baseDays,
}

console.log('━━━ ACCOUNT TOTALS ━━━\n')
console.log('Metric         | Today (partial) | Yesterday      | 7d Avg/day     | Yday vs 7d')
console.log('-'.repeat(85))
const fmt = (n, money=false) => money ? '$'+Math.round(n) : (Number.isInteger(n) ? n : n.toFixed(1))
const rows = [
  ['Spend',       '$'+T.spend.toFixed(0), '$'+Y.spend.toFixed(0), '$'+baseAvg.spend.toFixed(0), pct(Y.spend, baseAvg.spend)],
  ['Impressions', T.imp.toLocaleString(), Y.imp.toLocaleString(), Math.round(baseAvg.imp).toLocaleString(), pct(Y.imp, baseAvg.imp)],
  ['Clicks',      T.clk.toString(),       Y.clk.toString(),       Math.round(baseAvg.clk).toString(), pct(Y.clk, baseAvg.clk)],
  ['Conv',        T.conv.toFixed(1),      Y.conv.toFixed(1),      baseAvg.conv.toFixed(1), pct(Y.conv, baseAvg.conv)],
  ['Revenue',     '$'+T.val.toFixed(0),   '$'+Y.val.toFixed(0),   '$'+baseAvg.val.toFixed(0), pct(Y.val, baseAvg.val)],
  ['All-Conv $',  '$'+T.allVal.toFixed(0),'$'+Y.allVal.toFixed(0),'$'+baseAvg.allVal.toFixed(0), pct(Y.allVal, baseAvg.allVal)],
]
for (const r of rows) console.log(`${r[0].padEnd(14)} | ${r[1].padEnd(15)} | ${r[2].padEnd(14)} | ${r[3].padEnd(14)} | ${r[4]}`)

const yROAS = Y.spend>0?(Y.val/Y.spend):0
const tROAS = T.spend>0?(T.val/T.spend):0
const bROAS = B.spend>0?(B.val/B.spend):0
console.log(`ROAS           | ${tROAS.toFixed(2)}x           | ${yROAS.toFixed(2)}x          | ${bROAS.toFixed(2)}x         |`)
const yAMER = Y.spend>0?(Y.allVal/Y.spend):0
const bAMER = B.spend>0?(B.allVal/B.spend):0
const tAMER = T.spend>0?(T.allVal/T.spend):0
console.log(`aMER           | ${tAMER.toFixed(2)}x          | ${yAMER.toFixed(2)}x         | ${bAMER.toFixed(2)}x        |`)

// Per-campaign yesterday
console.log(`\n\n━━━ YESTERDAY PER-CAMPAIGN (${YDAY}) ━━━\n`)
console.log('Campaign'.padEnd(36) + ' | Spend  | Imp   | Clk | Conv | Rev    | ROAS')
console.log('-'.repeat(90))
const sortedCamps = [...Y.byCamp.entries()].sort((a,b)=>b[1].spend-a[1].spend)
for (const [cn, x] of sortedCamps) {
  if (x.spend < 0.5) continue
  const roas = x.spend>0?(x.val/x.spend).toFixed(2)+'x':'—'
  console.log(`${cn.slice(0,34).padEnd(36)} | $${x.spend.toFixed(0).padStart(4)}  | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${roas}`)
}

// Today so far per-campaign
console.log(`\n\n━━━ TODAY SO FAR (${TODAY}) ━━━\n`)
console.log('Campaign'.padEnd(36) + ' | Spend  | Imp   | Clk | Conv | Rev')
console.log('-'.repeat(80))
const sortedTodayCamps = [...T.byCamp.entries()].sort((a,b)=>b[1].spend-a[1].spend)
for (const [cn, x] of sortedTodayCamps) {
  if (x.spend < 0.5) continue
  console.log(`${cn.slice(0,34).padEnd(36)} | $${x.spend.toFixed(0).padStart(4)}  | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)}`)
}

// Cannons EXACT keyword activity yesterday + today
console.log(`\n\n━━━ NEW CANNONS EXACT KEYWORDS — Yesterday + Today ━━━\n`)
const NEW_EXACTS = ['gender reveal extinguisher','gender reveal fire extinguisher','gender reveal smoke bombs','gender reveal powder blaster','gender reveal mega blaster','gender reveal blasters','gender reveal extinguisher near me','gender reveal extinguishers','gender reveal colour blaster','gender reveal blaster','gender reveal powder extinguisher','gender extinguisher','gender reveal smoke blaster','confetti cannon gender reveal','gender reveal confetti cannons','biodegradable confetti cannon gender reveal','blue confetti cannon','gender reveal smoke confetti cannon']
const kw = await c.query(`
  SELECT segments.date, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM keyword_view
  WHERE campaign.name = 'GRI | Search | Cannons'
    AND ad_group_criterion.negative = FALSE
    AND ad_group_criterion.keyword.match_type = 'EXACT'
    AND segments.date BETWEEN '${YDAY}' AND '${TODAY}'
`)
const kwAgg = new Map()
for (const r of kw) {
  const t = (r.ad_group_criterion?.keyword?.text||'').toLowerCase()
  if (!NEW_EXACTS.includes(t)) continue
  if (!kwAgg.has(t)) kwAgg.set(t,{imp:0,clk:0,spend:0,conv:0,val:0})
  const x = kwAgg.get(t)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
let totImp=0,totClk=0,totConv=0,totVal=0
for (const [t,x] of [...kwAgg.entries()].sort((a,b)=>b[1].imp-a[1].imp)) {
  if (x.imp === 0) continue
  console.log(`  ${t.padEnd(40)} imp:${String(x.imp).padStart(3)} clk:${String(x.clk).padStart(2)} spend:$${x.spend.toFixed(0)} conv:${x.conv.toFixed(1)} rev:$${x.val.toFixed(0)}`)
  totImp+=x.imp;totClk+=x.clk;totConv+=x.conv;totVal+=x.val
}
console.log(`  TOTAL (last 48h):                     imp:${totImp} clk:${totClk} conv:${totConv.toFixed(1)} rev:$${totVal.toFixed(0)}`)

// Hourly trace today
console.log(`\n\n━━━ TODAY HOURLY TRACE — all active campaigns ━━━\n`)
const hr = await c.query(`
  SELECT segments.hour, metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date = '${TODAY}'
    AND campaign.status = 'ENABLED'
`)
const byHr = new Map()
for (const r of hr) {
  const h = r.segments?.hour
  if (h == null) continue
  if (!byHr.has(h)) byHr.set(h,{spend:0,imp:0,clk:0,conv:0,val:0})
  const x = byHr.get(h)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
console.log('Hour | Spend | Imp | Clk | Conv | Rev')
for (const [h,x] of [...byHr.entries()].sort((a,b)=>a[0]-b[0])) {
  console.log(`  ${String(h).padStart(2)}  | $${x.spend.toFixed(0).padStart(3)}  | ${String(x.imp).padStart(4)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1)} | $${x.val.toFixed(0)}`)
}

process.exit(0)
