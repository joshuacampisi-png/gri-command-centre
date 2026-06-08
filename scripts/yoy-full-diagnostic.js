/**
 * Full YoY Account Diagnostic — May 2025 vs May 2026
 *  + April-onwards change event audit
 *  + TNT 24-month performance trend
 *  + Negative keyword removal retroactive impact
 *  + Search-term volume comparison
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
import { writeFileSync, mkdirSync } from 'fs'

const c = getGadsCustomer()
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))
const pct = (a, b) => b === 0 ? '—' : (((a-b)/b*100) >= 0 ? '+' : '') + ((a-b)/b*100).toFixed(1) + '%'
const dollar = n => '$' + Math.round(n)

console.log('\n============================================================')
console.log('FULL YoY DIAGNOSTIC — May 2025 vs May 2026 (account-wide)')
console.log('============================================================\n')

// ============ 1. YoY MONTHLY TOTALS ============
console.log('━━━ 1. MONTH-BY-MONTH PERFORMANCE — 12-MONTH TREND ━━━\n')
const monthly = await c.query(`
  SELECT segments.date, campaign.advertising_channel_type,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '2025-05-01' AND '2026-05-31'
    AND campaign.status != 'REMOVED'
`)
const byMonth = new Map()
for (const r of monthly) {
  const m = r.segments?.date?.slice(0,7)
  if (!byMonth.has(m)) byMonth.set(m, {imp:0,clk:0,spend:0,conv:0,val:0,allConv:0,allVal:0})
  const x = byMonth.get(m)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
  x.allConv += Number(r.metrics?.all_conversions||0)
  x.allVal += Number(r.metrics?.all_conversions_value||0)
}
console.log('Month   | Spend   | Conv   | Rev      | ROAS  | aMER   | CPC   | CVR    | AOV')
console.log('-'.repeat(95))
for (const [m,x] of [...byMonth.entries()].sort()) {
  const cpc = x.clk > 0 ? x.spend/x.clk : 0
  const cvr = x.clk > 0 ? x.conv/x.clk*100 : 0
  const aov = x.conv > 0 ? x.val/x.conv : 0
  const roas = x.spend > 0 ? x.val/x.spend : 0
  const amer = x.spend > 0 ? x.allVal/x.spend : 0
  console.log(`${m} | $${x.spend.toFixed(0).padStart(5)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(6)} | ${roas.toFixed(2)}x | ${amer.toFixed(2)}x | $${cpc.toFixed(2)} | ${cvr.toFixed(1)}% | $${aov.toFixed(0)}`)
}

// May 2025 vs May 2026 direct
const may25 = byMonth.get('2025-05')
const may26 = byMonth.get('2026-05')
if (may25 && may26) {
  console.log(`\n━━━ MAY 2025 vs MAY 2026 (head-to-head) ━━━\n`)
  console.log(`Metric        | May 2025        | May 2026        | Δ`)
  console.log('-'.repeat(75))
  const rows = [
    ['Spend',         dollar(may25.spend),  dollar(may26.spend),  pct(may26.spend, may25.spend)],
    ['Impressions',   may25.imp.toLocaleString(), may26.imp.toLocaleString(), pct(may26.imp, may25.imp)],
    ['Clicks',        may25.clk.toLocaleString(), may26.clk.toLocaleString(), pct(may26.clk, may25.clk)],
    ['Conversions',   may25.conv.toFixed(0), may26.conv.toFixed(0), pct(may26.conv, may25.conv)],
    ['Revenue',       dollar(may25.val),     dollar(may26.val),     pct(may26.val, may25.val)],
    ['ROAS',          (may25.val/may25.spend).toFixed(2)+'x', (may26.val/may26.spend).toFixed(2)+'x', ''],
    ['aMER',          (may25.allVal/may25.spend).toFixed(2)+'x', (may26.allVal/may26.spend).toFixed(2)+'x', ''],
    ['Avg CPC',       '$'+(may25.spend/may25.clk).toFixed(2), '$'+(may26.spend/may26.clk).toFixed(2), pct(may26.spend/may26.clk, may25.spend/may25.clk)],
    ['CVR',           (may25.conv/may25.clk*100).toFixed(1)+'%', (may26.conv/may26.clk*100).toFixed(1)+'%', ''],
    ['AOV',           '$'+(may25.val/may25.conv).toFixed(0), '$'+(may26.val/may26.conv).toFixed(0), pct(may26.val/may26.conv, may25.val/may25.conv)],
  ]
  for (const r of rows) console.log(`${r[0].padEnd(13)} | ${r[1].padEnd(15)} | ${r[2].padEnd(15)} | ${r[3]}`)
}

// ============ 2. TNT-specific performance ============
console.log(`\n\n━━━ 2. TNT REVEAL PERFORMANCE — 24-MONTH TREND ━━━\n`)
const tnt = await c.query(`
  SELECT segments.date, segments.product_title,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '2024-12-01' AND '2026-05-31'
`)
const tntByMonth = new Map()
for (const r of tnt) {
  const t = (r.segments?.product_title || '').toLowerCase()
  if (!/tnt|self.hire/i.test(t)) continue
  const m = r.segments?.date?.slice(0,7)
  if (!tntByMonth.has(m)) tntByMonth.set(m, {imp:0,clk:0,spend:0,conv:0,val:0})
  const x = tntByMonth.get(m)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
console.log('Month   | TNT Imp | Clk | Spend  | Conv | Rev      | ROAS')
console.log('-'.repeat(70))
for (const [m,x] of [...tntByMonth.entries()].sort()) {
  const roas = x.spend > 0 ? (x.val/x.spend).toFixed(2)+'x' : '—'
  console.log(`${m} | ${String(x.imp).padStart(6)} | ${String(x.clk).padStart(3)} | $${x.spend.toFixed(0).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(6)} | ${roas}`)
}

// ============ 3. Change event audit — Apr 2026 onwards ============
console.log(`\n\n━━━ 3. CHANGE EVENT AUDIT — Apr 2026 onwards ━━━\n`)
const since = await c.query(`
  SELECT change_event.change_date_time, change_event.user_email,
         change_event.change_resource_type, change_event.resource_change_operation,
         change_event.client_type, campaign.name
  FROM change_event
  WHERE change_event.change_date_time DURING LAST_30_DAYS
  ORDER BY change_event.change_date_time DESC
  LIMIT 500
`)
console.log(`Total changes (last 30 days): ${since.length}\n`)
const byType = new Map()
const byUser = new Map()
const byOp = new Map()
for (const r of since) {
  const t = strCh(r.change_event?.change_resource_type)
  const u = r.change_event?.user_email
  const op = strCh(r.change_event?.resource_change_operation)
  byType.set(t, (byType.get(t)||0)+1)
  byUser.set(u, (byUser.get(u)||0)+1)
  byOp.set(op, (byOp.get(op)||0)+1)
}
console.log('By resource type:')
for (const [t,n] of [...byType.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${t.padEnd(38)} ${n}`)
console.log('\nBy operation:')
for (const [o,n] of [...byOp.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${o.padEnd(38)} ${n}`)
console.log('\nBy user:')
for (const [u,n] of [...byUser.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${(u||'?').padEnd(38)} ${n}`)

// ============ 4. Top dropped vs gained search terms YoY ============
console.log(`\n\n━━━ 4. SEARCH TERM CONVERSIONS — May 2025 vs May 2026 ━━━\n`)
async function searchTermPull(start, end) {
  return await c.query(`
    SELECT search_term_view.search_term, metrics.impressions,
           metrics.clicks, metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND metrics.impressions > 0
  `)
}
const st25 = await searchTermPull('2025-05-01', '2025-05-31')
const st26 = await searchTermPull('2026-05-01', '2026-05-29')
const aggSt = rows => {
  const m = new Map()
  for (const r of rows) {
    const t = (r.search_term_view?.search_term||'').toLowerCase()
    if (!m.has(t)) m.set(t,{imp:0,clk:0,conv:0,val:0})
    const x = m.get(t)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.conv += Number(r.metrics?.conversions||0)
    x.val += Number(r.metrics?.conversions_value||0)
  }
  return m
}
const map25 = aggSt(st25)
const map26 = aggSt(st26)
console.log(`May 2025 distinct terms: ${map25.size}, total imp: ${[...map25.values()].reduce((a,x)=>a+x.imp,0)}`)
console.log(`May 2026 distinct terms: ${map26.size}, total imp: ${[...map26.values()].reduce((a,x)=>a+x.imp,0)}`)
const top25 = [...map25.entries()].filter(([_,x])=>x.conv>=1).sort((a,b)=>b[1].val-a[1].val).slice(0,15)
const top26 = [...map26.entries()].filter(([_,x])=>x.conv>=1).sort((a,b)=>b[1].val-a[1].val).slice(0,15)
console.log(`\nTop converting terms — May 2025:`)
for (const [t,x] of top25) console.log(`  ${x.conv.toFixed(1).padStart(4)} conv  $${x.val.toFixed(0).padStart(5)}  "${t}"`)
console.log(`\nTop converting terms — May 2026:`)
for (const [t,x] of top26) console.log(`  ${x.conv.toFixed(1).padStart(4)} conv  $${x.val.toFixed(0).padStart(5)}  "${t}"`)

// Lost vs gained converters
const lost = [...map25.entries()].filter(([t,x]) => x.conv >= 1 && (!map26.has(t) || map26.get(t).conv === 0))
const gained = [...map26.entries()].filter(([t,x]) => x.conv >= 1 && (!map25.has(t) || map25.get(t).conv === 0))
console.log(`\nLOST converters (had conv in May 25, none in May 26): ${lost.length}`)
for (const [t,x] of lost.sort((a,b)=>b[1].val-a[1].val).slice(0,10)) console.log(`  ${x.conv.toFixed(1).padStart(4)} conv  $${x.val.toFixed(0).padStart(5)}  "${t}"`)
console.log(`\nGAINED converters (had no conv in May 25, gained in May 26): ${gained.length}`)
for (const [t,x] of gained.sort((a,b)=>b[1].val-a[1].val).slice(0,10)) console.log(`  ${x.conv.toFixed(1).padStart(4)} conv  $${x.val.toFixed(0).padStart(5)}  "${t}"`)

mkdirSync('data/snapshots/yoy-diagnostic', { recursive: true })
writeFileSync('data/snapshots/yoy-diagnostic/data.json', JSON.stringify({
  monthly: Object.fromEntries([...byMonth.entries()]),
  tntMonthly: Object.fromEntries([...tntByMonth.entries()]),
  changeEventsByType: Object.fromEntries([...byType.entries()]),
  changeEventsByUser: Object.fromEntries([...byUser.entries()]),
  lostConverters: lost.slice(0, 50).map(([t,x])=>({term:t,...x})),
  gainedConverters: gained.slice(0, 50).map(([t,x])=>({term:t,...x})),
}, null, 2))
console.log(`\nFull data: data/snapshots/yoy-diagnostic/data.json`)
process.exit(0)
