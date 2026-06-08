/**
 * Last 24h vs prior 24h vs 7d avg — early read post-ship
 * Today's ships:
 *  04:55 UTC PMAX Bundles $60→$70
 *  05:25 UTC Cannons: Smoke/Ext negs detached, budget $30→$40
 *  05:42 UTC Cannons: inline neg removed + 4 EXACT positives added
 *
 * Caveat: only ~6 hours since first ship. Conversions lag 24-72h.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))
const pct = (a,b) => b===0 ? '—' : (((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'

// AEST today is May 28. AEST midnight = 14:00 UTC the prior day
// Last 24h roughly = May 27 (account TZ probably AEST/Sydney)
const TODAY = '2026-05-28'  // current day so far (partial)
const YDAY = '2026-05-27'   // full prior day
const D2 = '2026-05-26'     // full day before that
const WEEK = ['2026-05-21','2026-05-22','2026-05-23','2026-05-24','2026-05-25','2026-05-26','2026-05-27']

async function fetchDay(dateStart, dateEnd) {
  const rows = await c.query(`
    SELECT segments.date, campaign.name, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.all_conversions, metrics.all_conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${dateStart}' AND '${dateEnd}'
      AND campaign.status != 'REMOVED'
  `)
  const byCamp = new Map()
  const totals = { imp:0, clk:0, spend:0, conv:0, val:0, allConv:0, allVal:0 }
  for (const r of rows) {
    const n = r.campaign?.name || '?'
    if (!byCamp.has(n)) byCamp.set(n, { imp:0, clk:0, spend:0, conv:0, val:0, allConv:0, allVal:0, channel: strCh(r.campaign?.advertising_channel_type) })
    const x = byCamp.get(n)
    const m = r.metrics
    const spend = Number(m?.cost_micros||0)/1e6
    x.imp += Number(m?.impressions||0); x.clk += Number(m?.clicks||0); x.spend += spend
    x.conv += Number(m?.conversions||0); x.val += Number(m?.conversions_value||0)
    x.allConv += Number(m?.all_conversions||0); x.allVal += Number(m?.all_conversions_value||0)
    totals.imp += Number(m?.impressions||0); totals.clk += Number(m?.clicks||0); totals.spend += spend
    totals.conv += Number(m?.conversions||0); totals.val += Number(m?.conversions_value||0)
    totals.allConv += Number(m?.all_conversions||0); totals.allVal += Number(m?.all_conversions_value||0)
  }
  return { byCamp, totals }
}

console.log(`\n=== LAST 24H POST-SHIP CHECK — ${new Date().toISOString()} ===`)
console.log(`Ships landed 04:55-05:42 UTC May 28 = approx 15:00 AEST yesterday`)
console.log(`Showing: TODAY-so-far (May 28) vs YDAY full (May 27) vs 7-day baseline\n`)

const [today, yday, d2, week] = await Promise.all([
  fetchDay(TODAY, TODAY),
  fetchDay(YDAY, YDAY),
  fetchDay(D2, D2),
  fetchDay(WEEK[0], WEEK[WEEK.length-1]),
])
const weekAvg = {
  imp: week.totals.imp/7, clk: week.totals.clk/7, spend: week.totals.spend/7,
  conv: week.totals.conv/7, val: week.totals.val/7,
  allConv: week.totals.allConv/7, allVal: week.totals.allVal/7,
}

console.log('━━━ ACCOUNT TOTALS ━━━\n')
console.log('Metric          | Today    | Yday     | D-2      | 7d avg   | Today vs Yday | Today vs 7d avg')
console.log('-'.repeat(110))
const rows = [
  ['Impressions',  today.totals.imp, yday.totals.imp, d2.totals.imp, weekAvg.imp],
  ['Clicks',       today.totals.clk, yday.totals.clk, d2.totals.clk, weekAvg.clk],
  ['Spend',        today.totals.spend, yday.totals.spend, d2.totals.spend, weekAvg.spend],
  ['Conversions',  today.totals.conv, yday.totals.conv, d2.totals.conv, weekAvg.conv],
  ['Revenue',      today.totals.val, yday.totals.val, d2.totals.val, weekAvg.val],
  ['All-Conv $',   today.totals.allVal, yday.totals.allVal, d2.totals.allVal, weekAvg.allVal],
]
for (const [label, t, y, d, w] of rows) {
  const fmt = label.includes('Spend')||label.includes('Revenue')||label.includes('Conv $') ? n => `$${n.toFixed(0)}` : (label.includes('Conv') ? n => n.toFixed(1) : n => String(Math.round(n)))
  console.log(`${label.padEnd(15)} | ${fmt(t).padStart(8)} | ${fmt(y).padStart(8)} | ${fmt(d).padStart(8)} | ${fmt(w).padStart(8)} | ${pct(t,y).padStart(13)} | ${pct(t,w).padStart(15)}`)
}
console.log('')
const tROAS = today.totals.spend>0 ? today.totals.val/today.totals.spend : 0
const yROAS = yday.totals.spend>0 ? yday.totals.val/yday.totals.spend : 0
const wROAS = weekAvg.spend>0 ? weekAvg.val/weekAvg.spend : 0
console.log(`ROAS:           ${tROAS.toFixed(2)}x   | ${yROAS.toFixed(2)}x   |          | ${wROAS.toFixed(2)}x   | Δ from yday: ${(tROAS-yROAS>=0?'+':'')+(tROAS-yROAS).toFixed(2)}x`)
console.log(`aMER:           ${today.totals.spend>0?(today.totals.allVal/today.totals.spend).toFixed(2):0}x   | ${yday.totals.spend>0?(yday.totals.allVal/yday.totals.spend).toFixed(2):0}x   |          | ${weekAvg.spend>0?(weekAvg.allVal/weekAvg.spend).toFixed(2):0}x`)

console.log('\n━━━ PER-CAMPAIGN — today vs yday ━━━\n')
console.log('Campaign                          | Today imp/clk/spend/conv/rev    | Yday imp/clk/spend/conv/rev')
console.log('-'.repeat(125))
const allCamps = new Set([...today.byCamp.keys(), ...yday.byCamp.keys()])
const sorted = [...allCamps].sort((a,b)=>(today.byCamp.get(b)?.spend||0)-(today.byCamp.get(a)?.spend||0))
for (const n of sorted) {
  const t = today.byCamp.get(n) || {imp:0,clk:0,spend:0,conv:0,val:0}
  const y = yday.byCamp.get(n) || {imp:0,clk:0,spend:0,conv:0,val:0}
  if (t.spend===0 && y.spend===0) continue
  console.log(`${n.slice(0,33).padEnd(33)} | ${String(t.imp).padStart(5)}/${String(t.clk).padStart(3)}/$${t.spend.toFixed(0).padStart(4)}/${t.conv.toFixed(1).padStart(4)}/$${t.val.toFixed(0).padStart(5)} | ${String(y.imp).padStart(5)}/${String(y.clk).padStart(3)}/$${y.spend.toFixed(0).padStart(4)}/${y.conv.toFixed(1).padStart(4)}/$${y.val.toFixed(0).padStart(5)}`)
}

console.log('\n━━━ CANNONS DEEP-DIVE — did new EXACT positives serve? (last 24h search-term report) ━━━\n')
try {
  const st = await c.query(`
    SELECT search_term_view.search_term, metrics.impressions, metrics.clicks,
           metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE campaign.name = 'GRI | Search | Cannons'
      AND segments.date BETWEEN '${YDAY}' AND '${TODAY}'
      AND metrics.impressions > 0
    ORDER BY metrics.impressions DESC
    LIMIT 50
  `)
  if (!st.length) console.log('  (no search-term data yet — typical 12-24h lag)')
  for (const r of st) {
    const term = r.search_term_view?.search_term
    const imp = Number(r.metrics?.impressions||0)
    const clk = Number(r.metrics?.clicks||0)
    const spend = Number(r.metrics?.cost_micros||0)/1e6
    const conv = Number(r.metrics?.conversions||0)
    const val = Number(r.metrics?.conversions_value||0)
    const isNewIntent = /smoke|extinguisher|blaster/i.test(term)
    console.log(`  ${isNewIntent?'🆕':'  '} "${term?.slice(0,50).padEnd(50)}" imp:${String(imp).padStart(4)} clk:${String(clk).padStart(2)} spend:$${spend.toFixed(0).padStart(3)} conv:${conv.toFixed(1)} rev:$${val.toFixed(0)}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

console.log('\n━━━ HOURLY TRACE for today (Cannons) ━━━\n')
try {
  const hr = await c.query(`
    SELECT segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE campaign.name = 'GRI | Search | Cannons' AND segments.date = '${TODAY}'
  `)
  console.log('Hour | Imp | Clk | Spend | Conv | Rev')
  for (const r of hr.sort((a,b)=>(a.segments?.hour||0)-(b.segments?.hour||0))) {
    const h = r.segments?.hour
    console.log(`  ${String(h).padStart(2)}  | ${String(Number(r.metrics?.impressions||0)).padStart(4)} | ${String(Number(r.metrics?.clicks||0)).padStart(3)} | $${(Number(r.metrics?.cost_micros||0)/1e6).toFixed(0).padStart(3)} | ${Number(r.metrics?.conversions||0).toFixed(1)} | $${Number(r.metrics?.conversions_value||0).toFixed(0)}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

process.exit(0)
