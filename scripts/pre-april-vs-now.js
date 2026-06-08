/**
 * Pre-April surgery vs now — YoY + sequential comparison
 * Pre-surgery baseline: Feb 1 - Apr 12, 2026 (70 days before changes started)
 * Post-surgery: Apr 13 - Jun 3, 2026 (52 days)
 * Same period 2025 for YoY
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

async function fetchRange(start, end, label) {
  const rows = await c.query(`
    SELECT segments.date, campaign.name,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.all_conversions, metrics.all_conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)
  const t = {imp:0,clk:0,spend:0,conv:0,val:0,allConv:0,allVal:0}
  const byCamp = new Map()
  const dates = new Set()
  for (const r of rows) {
    dates.add(r.segments?.date)
    const m = r.metrics
    const sp = Number(m?.cost_micros||0)/1e6
    t.imp += Number(m?.impressions||0); t.clk += Number(m?.clicks||0); t.spend += sp
    t.conv += Number(m?.conversions||0); t.val += Number(m?.conversions_value||0)
    t.allConv += Number(m?.all_conversions||0); t.allVal += Number(m?.all_conversions_value||0)
    const cn = r.campaign?.name || '?'
    if (!byCamp.has(cn)) byCamp.set(cn,{imp:0,clk:0,spend:0,conv:0,val:0})
    const c = byCamp.get(cn)
    c.imp += Number(m?.impressions||0); c.clk += Number(m?.clicks||0); c.spend += sp
    c.conv += Number(m?.conversions||0); c.val += Number(m?.conversions_value||0)
  }
  t.days = dates.size
  t.byCamp = byCamp
  t.label = label
  return t
}

const PRE_START = '2026-02-01', PRE_END = '2026-04-12'   // pre-surgery
const POST_START = '2026-04-13', POST_END = '2026-06-03' // post-surgery
const YOY_PRE_START = '2025-02-01', YOY_PRE_END = '2025-04-12'
const YOY_POST_START = '2025-04-13', YOY_POST_END = '2025-06-03'

const [pre, post, yoyPre, yoyPost] = await Promise.all([
  fetchRange(PRE_START, PRE_END, 'PRE-SURGERY 2026'),
  fetchRange(POST_START, POST_END, 'POST-SURGERY 2026'),
  fetchRange(YOY_PRE_START, YOY_PRE_END, 'PRE 2025'),
  fetchRange(YOY_POST_START, YOY_POST_END, 'POST 2025'),
])

const pct = (a,b) => b===0?'—':(((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'
const norm = t => ({
  days: t.days,
  spendD: t.spend/t.days,
  valD: t.val/t.days,
  allValD: t.allVal/t.days,
  convD: t.conv/t.days,
  clkD: t.clk/t.days,
  impD: t.imp/t.days,
  roas: t.spend>0?t.val/t.spend:0,
  amer: t.spend>0?t.allVal/t.spend:0,
  cpc: t.clk>0?t.spend/t.clk:0,
  ctr: t.imp>0?t.clk/t.imp:0,
  cpa: t.conv>0?t.spend/t.conv:0,
  aov: t.conv>0?t.val/t.conv:0,
})
const PRE = norm(pre), POST = norm(post), YPRE = norm(yoyPre), YPOST = norm(yoyPost)

console.log(`\n=== PRE vs POST APRIL SURGERY ===\n`)
console.log(`PRE  (${PRE_START} → ${PRE_END}, ${pre.days} days)`)
console.log(`POST (${POST_START} → ${POST_END}, ${post.days} days)\n`)

console.log('PER DAY AVG     | PRE             | POST            | Delta')
console.log('-'.repeat(75))
console.log(`Spend           | $${PRE.spendD.toFixed(0).padEnd(14)}  | $${POST.spendD.toFixed(0).padEnd(14)}  | ${pct(POST.spendD, PRE.spendD)}`)
console.log(`Revenue         | $${PRE.valD.toFixed(0).padEnd(14)}  | $${POST.valD.toFixed(0).padEnd(14)}  | ${pct(POST.valD, PRE.valD)}`)
console.log(`All-Conv Value  | $${PRE.allValD.toFixed(0).padEnd(14)}  | $${POST.allValD.toFixed(0).padEnd(14)}  | ${pct(POST.allValD, PRE.allValD)}`)
console.log(`Conversions     | ${PRE.convD.toFixed(1).padEnd(15)}  | ${POST.convD.toFixed(1).padEnd(15)}  | ${pct(POST.convD, PRE.convD)}`)
console.log(`Clicks          | ${PRE.clkD.toFixed(0).padEnd(15)}  | ${POST.clkD.toFixed(0).padEnd(15)}  | ${pct(POST.clkD, PRE.clkD)}`)
console.log(`Impressions     | ${PRE.impD.toFixed(0).padEnd(15)}  | ${POST.impD.toFixed(0).padEnd(15)}  | ${pct(POST.impD, PRE.impD)}`)
console.log(`ROAS            | ${PRE.roas.toFixed(2)}x${' '.repeat(11)} | ${POST.roas.toFixed(2)}x${' '.repeat(11)} | ${pct(POST.roas, PRE.roas)}`)
console.log(`aMER            | ${PRE.amer.toFixed(2)}x${' '.repeat(11)} | ${POST.amer.toFixed(2)}x${' '.repeat(11)} | ${pct(POST.amer, PRE.amer)}`)
console.log(`CTR             | ${(PRE.ctr*100).toFixed(2)}%${' '.repeat(11)} | ${(POST.ctr*100).toFixed(2)}%${' '.repeat(11)} | ${pct(POST.ctr, PRE.ctr)}`)
console.log(`CPC             | $${PRE.cpc.toFixed(2).padEnd(14)}  | $${POST.cpc.toFixed(2).padEnd(14)}  | ${pct(POST.cpc, PRE.cpc)}`)
console.log(`CPA             | $${PRE.cpa.toFixed(2).padEnd(14)}  | $${POST.cpa.toFixed(2).padEnd(14)}  | ${pct(POST.cpa, PRE.cpa)}`)
console.log(`AOV             | $${PRE.aov.toFixed(0).padEnd(14)}  | $${POST.aov.toFixed(0).padEnd(14)}  | ${pct(POST.aov, PRE.aov)}`)

console.log(`\n\n=== YoY SAME-PERIOD COMPARISON ===\n`)
console.log(`POST-surgery 2026 vs same dates 2025 (Apr 13 → Jun 3)\n`)
console.log('PER DAY AVG     | 2025            | 2026 POST       | YoY')
console.log('-'.repeat(75))
console.log(`Spend           | $${YPOST.spendD.toFixed(0).padEnd(14)}  | $${POST.spendD.toFixed(0).padEnd(14)}  | ${pct(POST.spendD, YPOST.spendD)}`)
console.log(`Revenue         | $${YPOST.valD.toFixed(0).padEnd(14)}  | $${POST.valD.toFixed(0).padEnd(14)}  | ${pct(POST.valD, YPOST.valD)}`)
console.log(`ROAS            | ${YPOST.roas.toFixed(2)}x${' '.repeat(11)} | ${POST.roas.toFixed(2)}x${' '.repeat(11)} | ${pct(POST.roas, YPOST.roas)}`)
console.log(`Conv            | ${YPOST.convD.toFixed(1).padEnd(15)}  | ${POST.convD.toFixed(1).padEnd(15)}  | ${pct(POST.convD, YPOST.convD)}`)
console.log(`CPC             | $${YPOST.cpc.toFixed(2).padEnd(14)}  | $${POST.cpc.toFixed(2).padEnd(14)}  | ${pct(POST.cpc, YPOST.cpc)}`)
console.log(`CTR             | ${(YPOST.ctr*100).toFixed(2)}%${' '.repeat(11)} | ${(POST.ctr*100).toFixed(2)}%${' '.repeat(11)} | ${pct(POST.ctr, YPOST.ctr)}`)

console.log(`\n\n=== TOP CAMPAIGNS — POST PERIOD ===\n`)
console.log('Campaign'.padEnd(40) + ' | Spend  | Rev    | ROAS  | Conv')
console.log('-'.repeat(85))
for (const [cn,x] of [...post.byCamp.entries()].sort((a,b)=>b[1].spend-a[1].spend).slice(0,10)) {
  if (x.spend < 50) continue
  const roas = x.spend>0?(x.val/x.spend).toFixed(2)+'x':'—'
  console.log(`${cn.slice(0,38).padEnd(40)} | $${x.spend.toFixed(0).padStart(4)}  | $${x.val.toFixed(0).padStart(5)} | ${roas.padStart(5)} | ${x.conv.toFixed(0).padStart(4)}`)
}

console.log(`\n\n=== TOP CAMPAIGNS — PRE PERIOD ===\n`)
console.log('Campaign'.padEnd(40) + ' | Spend  | Rev    | ROAS  | Conv')
console.log('-'.repeat(85))
for (const [cn,x] of [...pre.byCamp.entries()].sort((a,b)=>b[1].spend-a[1].spend).slice(0,10)) {
  if (x.spend < 50) continue
  const roas = x.spend>0?(x.val/x.spend).toFixed(2)+'x':'—'
  console.log(`${cn.slice(0,38).padEnd(40)} | $${x.spend.toFixed(0).padStart(4)}  | $${x.val.toFixed(0).padStart(5)} | ${roas.padStart(5)} | ${x.conv.toFixed(0).padStart(4)}`)
}

process.exit(0)
