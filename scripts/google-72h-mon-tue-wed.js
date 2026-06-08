/**
 * Real 72h Google Ads report — Mon (Jun 1) / Tue (Jun 2) / Wed (Jun 3 partial)
 *  - Daily breakdown
 *  - Per-campaign per-day
 *  - Top search terms (impressions, clicks, conversions, CTR)
 *  - Impression share + lost-rank/lost-budget
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
import { writeFileSync, mkdirSync } from 'fs'

const c = getGadsCustomer()
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))
const pct = n => n==null ? '—' : (Number(n)*100).toFixed(1)+'%'

const MON = '2026-06-01'
const TUE = '2026-06-02'
const WED = '2026-06-03'

console.log(`\n=== GOOGLE ADS 72H REPORT (${MON} → ${WED}) ===\n`)

// 1. DAILY ACCOUNT TOTALS
console.log('━━━ 1. DAILY ACCOUNT TOTALS ━━━\n')
const daily = await c.query(`
  SELECT segments.date, campaign.name,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value,
         metrics.search_impression_share, metrics.search_top_impression_share,
         metrics.search_absolute_top_impression_share,
         metrics.search_budget_lost_impression_share,
         metrics.search_rank_lost_impression_share
  FROM campaign
  WHERE segments.date BETWEEN '${MON}' AND '${WED}'
    AND campaign.status != 'REMOVED'
`)

const byDay = new Map()
const byCampDay = new Map()
for (const r of daily) {
  const d = r.segments?.date
  const m = r.metrics
  if (!byDay.has(d)) byDay.set(d, {imp:0,clk:0,spend:0,conv:0,val:0,allConv:0,allVal:0,is:[],lb:[],lr:[],top:[],abs:[]})
  const x = byDay.get(d)
  x.imp += Number(m?.impressions||0); x.clk += Number(m?.clicks||0); x.spend += Number(m?.cost_micros||0)/1e6
  x.conv += Number(m?.conversions||0); x.val += Number(m?.conversions_value||0)
  x.allConv += Number(m?.all_conversions||0); x.allVal += Number(m?.all_conversions_value||0)
  if (m?.search_impression_share!=null) x.is.push(Number(m.search_impression_share))
  if (m?.search_budget_lost_impression_share!=null) x.lb.push(Number(m.search_budget_lost_impression_share))
  if (m?.search_rank_lost_impression_share!=null) x.lr.push(Number(m.search_rank_lost_impression_share))
  if (m?.search_top_impression_share!=null) x.top.push(Number(m.search_top_impression_share))
  if (m?.search_absolute_top_impression_share!=null) x.abs.push(Number(m.search_absolute_top_impression_share))

  const key = `${d}|${r.campaign?.name}`
  if (!byCampDay.has(key)) byCampDay.set(key, {imp:0,clk:0,spend:0,conv:0,val:0})
  const c = byCampDay.get(key)
  c.imp += Number(m?.impressions||0); c.clk += Number(m?.clicks||0); c.spend += Number(m?.cost_micros||0)/1e6
  c.conv += Number(m?.conversions||0); c.val += Number(m?.conversions_value||0)
}
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null
const dayLabel = d => ({'2026-06-01':'Mon','2026-06-02':'Tue','2026-06-03':'Wed'})[d] || d

console.log('Date       | Day | Imp    | Clk | CTR    | Spend  | Conv | Rev    | ROAS  | aMER  | SIS    | LostBud | LostRank')
console.log('-'.repeat(125))
for (const [d,x] of [...byDay.entries()].sort()) {
  const ctr = x.imp>0 ? (x.clk/x.imp*100).toFixed(2)+'%' : '—'
  const roas = x.spend>0 ? (x.val/x.spend).toFixed(2)+'x' : '—'
  const amer = x.spend>0 ? (x.allVal/x.spend).toFixed(2)+'x' : '—'
  console.log(`${d} | ${dayLabel(d)} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | ${ctr.padStart(5)} | $${x.spend.toFixed(0).padStart(4)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${roas.padStart(5)} | ${amer.padStart(5)} | ${pct(avg(x.is)).padStart(6)} | ${pct(avg(x.lb)).padStart(6)} | ${pct(avg(x.lr)).padStart(6)}`)
}

// 2. PER-CAMPAIGN PER-DAY
console.log(`\n━━━ 2. PER-CAMPAIGN PER-DAY ━━━\n`)
const campNames = [...new Set([...byCampDay.keys()].map(k=>k.split('|')[1]))]
console.log('Campaign'.padEnd(36) + ' | Day | Spend  | Imp   | Clk | Conv | Rev    | ROAS')
console.log('-'.repeat(105))
for (const cn of campNames) {
  for (const d of [MON, TUE, WED]) {
    const x = byCampDay.get(`${d}|${cn}`)
    if (!x || x.spend < 0.5) continue
    const roas = x.spend>0 ? (x.val/x.spend).toFixed(2)+'x' : '—'
    console.log(`${cn.slice(0,34).padEnd(36)} | ${dayLabel(d)} | $${x.spend.toFixed(0).padStart(4)}  | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${roas}`)
  }
  console.log('')
}

// 3. TOP SEARCH TERMS (Search only, last 72h)
console.log(`━━━ 3. TOP SEARCH TERMS — what people typed (Search ads + Cannons) ━━━\n`)
const st = await c.query(`
  SELECT search_term_view.search_term, campaign.name,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE segments.date BETWEEN '${MON}' AND '${WED}'
    AND metrics.impressions > 0
`)
const stAgg = new Map()
for (const r of st) {
  const t = (r.search_term_view?.search_term||'').toLowerCase()
  if (!stAgg.has(t)) stAgg.set(t, {imp:0,clk:0,spend:0,conv:0,val:0,camps:new Set()})
  const x = stAgg.get(t)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
  x.camps.add(r.campaign?.name)
}
const sorted = [...stAgg.entries()].sort((a,b) => b[1].imp - a[1].imp)
console.log(`Total distinct search terms (72h): ${sorted.length}\n`)
console.log('TOP 25 BY IMPRESSIONS:')
console.log('Imp | Clk | CTR    | Spend | Conv | Rev   | Term')
console.log('-'.repeat(95))
for (const [t,x] of sorted.slice(0,25)) {
  const ctr = x.imp>0 ? (x.clk/x.imp*100).toFixed(1)+'%' : '—'
  console.log(`${String(x.imp).padStart(3)} | ${String(x.clk).padStart(3)} | ${ctr.padStart(5)} | $${x.spend.toFixed(0).padStart(3)}   | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(4)}  | "${t.slice(0,55)}"`)
}

console.log('\nTOP 15 BY CONVERSIONS:')
const byConv = [...stAgg.entries()].filter(([_,x])=>x.conv>0).sort((a,b)=>b[1].val-a[1].val)
console.log('Imp | Clk | Conv | Rev    | Term')
for (const [t,x] of byConv.slice(0,15)) {
  console.log(`${String(x.imp).padStart(3)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)}  | "${t.slice(0,55)}"`)
}

// 4. PMAX category insights (what PMAX matched)
console.log(`\n\n━━━ 4. PMAX SEARCH TERM INSIGHTS — what PMAX matched (last 72h) ━━━\n`)
try {
  const pmax = await c.query(`
    SELECT campaign.name, campaign_search_term_insight.category_label,
           metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
    FROM campaign_search_term_insight
    WHERE segments.date BETWEEN '${MON}' AND '${WED}'
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
  `)
  const pmaxAgg = new Map()
  for (const r of pmax) {
    const lbl = (r.campaign_search_term_insight?.category_label||'').toLowerCase()
    if (!pmaxAgg.has(lbl)) pmaxAgg.set(lbl,{imp:0,clk:0,conv:0,val:0})
    const x = pmaxAgg.get(lbl)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.conv += Number(r.metrics?.conversions||0)
    x.val += Number(r.metrics?.conversions_value||0)
  }
  const pmaxSorted = [...pmaxAgg.entries()].sort((a,b)=>b[1].imp-a[1].imp)
  console.log(`PMAX matched ${pmaxSorted.length} distinct category labels\n`)
  console.log('TOP 20 PMAX search themes:')
  console.log('Imp  | Clk | Conv | Rev    | Category Label')
  for (const [t,x] of pmaxSorted.slice(0,20)) {
    console.log(`${String(x.imp).padStart(4)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)}  | "${t.slice(0,60)}"`)
  }
} catch(e) { console.log('  pmax err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

mkdirSync('data/snapshots/google-72h', { recursive: true })
writeFileSync('data/snapshots/google-72h/data.json', JSON.stringify({
  byDay: Object.fromEntries([...byDay.entries()]),
  searchTerms: sorted.slice(0,50).map(([t,x])=>({term:t, ...x, camps:[...x.camps]})),
}, null, 2))
process.exit(0)
