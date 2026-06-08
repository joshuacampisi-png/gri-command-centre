/**
 * Truth check on who's actually beating us in Shopping
 *  - Auction insights (correct fields)
 *  - Big W / Kmart / Amazon presence trace
 *  - Conversion lag check (24h click attribution)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const pct = n => n==null?'—':(Number(n)*100).toFixed(1)+'%'

// Auction insights for Shopping campaigns
console.log('\n=== AUCTION INSIGHTS — Shopping (last 30d) ===\n')
try {
  const ai = await c.query(`
    SELECT campaign.name, segments.auction_insight_domain,
           metrics.search_impression_share, metrics.search_top_impression_share,
           metrics.search_absolute_top_impression_percentage
    FROM ad_group_audience_view
    WHERE campaign.advertising_channel_type IN ('PERFORMANCE_MAX','SHOPPING')
      AND segments.date DURING LAST_30_DAYS
    LIMIT 50
  `)
  if (!ai.length) console.log('  (no data — auction insights may require minimum activity threshold)')
  for (const r of ai) {
    const d = r.segments?.auction_insight_domain
    if (!d) continue
    console.log(`  ${r.campaign?.name?.slice(0,30).padEnd(30)} | ${d.padEnd(35)} | SIS:${pct(r.metrics?.search_impression_share)} | Top:${pct(r.metrics?.search_top_impression_share)}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

// Try alternate path — auction_insight_domain at click_view level
console.log('\n=== TRYING ALTERNATIVE: Display & Video Network audience view ===\n')
try {
  const ai2 = await c.query(`
    SELECT campaign.name, segments.auction_insight_domain,
           metrics.impressions_from_store_reach
    FROM campaign
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND segments.date DURING LAST_30_DAYS
    LIMIT 5
  `)
  console.log('  Note: Google removed search_overlap_rate / outranking_share from PMAX reports.')
  console.log('  Auction insights for PMAX must be viewed in Google Ads UI > Insights tab.')
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

// Click-conversion lag — yesterday's clicks vs today's posted conversions
console.log('\n=== CLICK-CONVERSION LAG TRUTH CHECK ===\n')
const lag = await c.query(`
  SELECT segments.date, metrics.clicks, metrics.conversions, metrics.conversions_value,
         metrics.conversions_from_interactions_rate
  FROM campaign
  WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
    AND segments.date BETWEEN '2026-05-21' AND '2026-05-28'
`)
const byDay = new Map()
for (const r of lag) {
  const d = r.segments?.date
  if (!byDay.has(d)) byDay.set(d,{clk:0,conv:0,val:0})
  const x = byDay.get(d)
  x.clk += Number(r.metrics?.clicks||0)
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
console.log('Date       | Clicks | Conv | Rev    | CVR  | Days conv lagging behind clicks')
for (const [d,x] of [...byDay.entries()].sort()) {
  const cvr = x.clk>0 ? (x.conv/x.clk*100).toFixed(2)+'%' : '—'
  console.log(`${d} | ${String(x.clk).padStart(5)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${cvr.padStart(5)}`)
}

// Last year same-week comparison
console.log('\n=== SAME WEEK LAST YEAR vs THIS WEEK ===\n')
const thisWeek = await c.query(`
  SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '2026-05-22' AND '2026-05-28'
`)
const lastYearSameWeek = await c.query(`
  SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '2025-05-22' AND '2025-05-28'
`)
function totals(rows) {
  let t = {imp:0,clk:0,spend:0,conv:0,val:0}
  for (const r of rows) {
    t.imp += Number(r.metrics?.impressions||0)
    t.clk += Number(r.metrics?.clicks||0)
    t.spend += Number(r.metrics?.cost_micros||0)/1e6
    t.conv += Number(r.metrics?.conversions||0)
    t.val += Number(r.metrics?.conversions_value||0)
  }
  return t
}
const tw = totals(thisWeek)
const ly = totals(lastYearSameWeek)
console.log(`Metric           | This week 2026  | Same week 2025  | Δ`)
console.log('-'.repeat(80))
const fmt = (a,b,prefix='') => `${prefix}${a.toFixed(0)}  vs  ${prefix}${b.toFixed(0)}  (${b>0?(((a-b)/b*100)).toFixed(0):'∞'}%)`
console.log(`Impressions      | ${String(tw.imp).padEnd(15)} | ${String(ly.imp).padEnd(15)} | ${ly.imp>0?(((tw.imp-ly.imp)/ly.imp)*100).toFixed(0)+'%':'∞'}`)
console.log(`Clicks           | ${String(tw.clk).padEnd(15)} | ${String(ly.clk).padEnd(15)} | ${ly.clk>0?(((tw.clk-ly.clk)/ly.clk)*100).toFixed(0)+'%':'∞'}`)
console.log(`Spend            | $${tw.spend.toFixed(0).padEnd(14)} | $${ly.spend.toFixed(0).padEnd(14)} | ${ly.spend>0?(((tw.spend-ly.spend)/ly.spend)*100).toFixed(0)+'%':'∞'}`)
console.log(`Conv             | ${tw.conv.toFixed(1).padEnd(15)} | ${ly.conv.toFixed(1).padEnd(15)} | ${ly.conv>0?(((tw.conv-ly.conv)/ly.conv)*100).toFixed(0)+'%':'∞'}`)
console.log(`Revenue          | $${tw.val.toFixed(0).padEnd(14)} | $${ly.val.toFixed(0).padEnd(14)} | ${ly.val>0?(((tw.val-ly.val)/ly.val)*100).toFixed(0)+'%':'∞'}`)
console.log(`ROAS             | ${(tw.val/tw.spend).toFixed(2)}x          | ${(ly.val/ly.spend).toFixed(2)}x          |`)
console.log(`AOV              | $${tw.conv>0?(tw.val/tw.conv).toFixed(0):0}            | $${ly.conv>0?(ly.val/ly.conv).toFixed(0):0}            |`)

process.exit(0)
