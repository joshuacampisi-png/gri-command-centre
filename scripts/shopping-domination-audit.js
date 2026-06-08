/**
 * Full Shopping domination audit
 *  1. Live SERP scrape (clean, no personalization) on top product queries
 *     — count YOUR slots vs competitor slots in Shopping carousel + organic
 *  2. 12-month Shopping performance trend
 *  3. Shopping IS (impression share) per campaign per month
 *  4. Big W + Confettified + Etsy + Amazon presence trace
 *  5. Title-level audit — are titles winning the auction?
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const DFSE = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))

// =========== 1. CLEAN SERP SCRAPE ===========
console.log('\n=== 1. LIVE SHOPPING SERP (clean / no personalization) ===\n')

const QUERIES = [
  'gender reveal',
  'gender reveal cannon',
  'gender reveal smoke bomb',
  'gender reveal extinguisher',
  'gender reveal ideas',
  'gender reveal powder cannon',
  'gender reveal australia',
]

async function scrapeShopping(kw) {
  // Use SERP scrape with shopping items
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method: 'POST',
    headers: { Authorization: DFSE, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keyword: kw,
      location_code: 2036, // Australia
      language_code: 'en',
      device: 'desktop',
      depth: 30,
    }]),
  }).then(r => r.json())
  return r.tasks?.[0]?.result?.[0]?.items || []
}

const COMP_DOMAINS = ['confettified.com.au','amazon.com.au','etsy.com','bigw.com.au','kmart.com.au','catch.com.au','spotlight.com.au','target.com.au','ebay.com.au','aussiereveals.com.au','genderrevealcannon.com.au','genderrevealer.com.au','kaboomconfetti.com.au','icandyballoons.com.au']
const classify = url => {
  const u = (url||'').toLowerCase()
  if (u.includes('genderrevealideas.com.au')) return 'US'
  for (const d of COMP_DOMAINS) if (u.includes(d)) return d
  return 'OTHER'
}

const serpResults = {}
for (const q of QUERIES) {
  process.stdout.write(`  ${q.padEnd(35)} `)
  try {
    const items = await scrapeShopping(q)
    // Shopping carousel comes as items of type 'shopping' or as nested in 'google_shopping_serp_element'
    const shopping = items.filter(it => /shopping/.test(it.type||''))
    const organic = items.filter(it => it.type === 'organic')
    const shoppingDomains = []
    for (const s of shopping) {
      if (s.items && Array.isArray(s.items)) {
        for (const sub of s.items) {
          const dom = sub.shop || sub.domain || sub.source || sub.url || ''
          shoppingDomains.push({ source: sub.shop || sub.source || dom, price: sub.price?.current || sub.price, title: sub.title })
        }
      } else if (s.shop || s.source) {
        shoppingDomains.push({ source: s.shop || s.source, price: s.price?.current || s.price, title: s.title })
      }
    }
    const orgUs = organic.filter(it => /genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
    serpResults[q] = { shopping: shoppingDomains, organicUs: orgUs.length, totalShopping: shoppingDomains.length, totalOrganic: organic.length }
    console.log(`shopping:${shoppingDomains.length}  organic:${organic.length}`)
  } catch(e) {
    console.log(`ERR ${e.message?.slice(0,40)}`)
  }
  await new Promise(r => setTimeout(r, 400))
}

console.log('\n--- Shopping carousel breakdown per query ---')
for (const [q, data] of Object.entries(serpResults)) {
  console.log(`\n[${q}]  shopping slots: ${data.shopping.length}`)
  const tally = {}
  for (const s of data.shopping) {
    const src = (s.source||'unknown').toLowerCase()
    const cat = src.includes('gender reveal ideas')||src.includes('genderrevealideas') ? '👈 US' : src
    tally[cat] = (tally[cat]||0) + 1
  }
  for (const [src, count] of Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,10)) {
    console.log(`    ${count}× ${src}`)
  }
}

// =========== 2. 12-MONTH SHOPPING PERFORMANCE ===========
console.log('\n\n=== 2. 12-MONTH SHOPPING PERFORMANCE — MONTHLY ===\n')
const monthly = await c.query(`
  SELECT segments.date, campaign.advertising_channel_type,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value,
         metrics.search_impression_share, metrics.search_budget_lost_impression_share,
         metrics.search_rank_lost_impression_share
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '2025-05-28' AND '2026-05-28'
`)
const byMonth = new Map()
for (const r of monthly) {
  const m = r.segments?.date?.slice(0,7)
  if (!byMonth.has(m)) byMonth.set(m, {imp:0,clk:0,spend:0,conv:0,val:0,is:[],lb:[],lr:[]})
  const x = byMonth.get(m)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
  if (r.metrics?.search_impression_share!=null) x.is.push(Number(r.metrics.search_impression_share))
  if (r.metrics?.search_budget_lost_impression_share!=null) x.lb.push(Number(r.metrics.search_budget_lost_impression_share))
  if (r.metrics?.search_rank_lost_impression_share!=null) x.lr.push(Number(r.metrics.search_rank_lost_impression_share))
}
const avg = a => a.length?a.reduce((x,y)=>x+y,0)/a.length:null
const pct = n => n==null?'—':(Number(n)*100).toFixed(1)+'%'
console.log('Month   | Imp     | Clk   | Spend  | Conv  | Rev    | ROAS  | SIS   | LostBud | LostRank')
console.log('-'.repeat(105))
for (const [m,x] of [...byMonth.entries()].sort()) {
  console.log(`${m} | ${String(x.imp).padStart(6)} | ${String(x.clk).padStart(4)} | $${x.spend.toFixed(0).padStart(5)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${x.spend>0?(x.val/x.spend).toFixed(2):0}x | ${pct(avg(x.is)).padStart(6)} | ${pct(avg(x.lb)).padStart(6)} | ${pct(avg(x.lr)).padStart(6)}`)
}

// =========== 3. Last 7 days Shopping detail ===========
console.log('\n\n=== 3. LAST 7 DAYS SHOPPING — daily trend ===\n')
const last7 = await c.query(`
  SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '2026-05-21' AND '2026-05-28'
`)
const byDay = new Map()
for (const r of last7) {
  const d = r.segments?.date
  if (!byDay.has(d)) byDay.set(d, {imp:0,clk:0,spend:0,conv:0,val:0})
  const x = byDay.get(d)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
const dayName = ds => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ds).getUTCDay()]
console.log('Date       | Day | Imp    | Clk  | Spend | Conv | Rev    | ROAS')
for (const [d,x] of [...byDay.entries()].sort()) {
  console.log(`${d} | ${dayName(d)} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(4)} | $${x.spend.toFixed(0).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${x.spend>0?(x.val/x.spend).toFixed(2):0}x`)
}

// =========== 4. Top 20 products last 7d ===========
console.log('\n\n=== 4. TOP 20 PRODUCTS — LAST 7 DAYS ===\n')
const prod = await c.query(`
  SELECT segments.product_title, segments.product_item_id,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '2026-05-21' AND '2026-05-28'
`)
const pAgg = new Map()
for (const r of prod) {
  const t = r.segments?.product_title || '?'
  if (!pAgg.has(t)) pAgg.set(t,{imp:0,clk:0,spend:0,conv:0,val:0})
  const x = pAgg.get(t)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
const ranked = [...pAgg.entries()].sort((a,b)=>b[1].spend-a[1].spend).slice(0,20)
console.log('Spend | Imp   | Clk | Conv | Rev    | ROAS | Title')
console.log('-'.repeat(115))
for (const [t,x] of ranked) {
  const roas = x.spend>0 ? (x.val/x.spend).toFixed(2)+'x' : '—'
  console.log(`$${x.spend.toFixed(0).padStart(4)} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${roas.padStart(5)} | ${t.slice(0,68)}`)
}

// =========== 5. Auction insights — who's outranking us in Shopping ===========
console.log('\n\n=== 5. SHOPPING AUCTION INSIGHTS — competitors last 30d ===\n')
try {
  const ai = await c.query(`
    SELECT campaign.name, segments.auction_insight_domain,
           metrics.search_impression_share, metrics.search_top_impression_share,
           metrics.search_outranking_share, metrics.search_overlap_rate
    FROM campaign_audience_view
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND segments.date DURING LAST_30_DAYS
  `)
  console.log('Domain                              | SIS    | Top    | OutRank | Overlap')
  for (const r of ai.slice(0,30)) {
    const d = r.segments?.auction_insight_domain
    if (!d) continue
    console.log(`  ${d.padEnd(35)} | ${pct(r.metrics?.search_impression_share).padStart(6)} | ${pct(r.metrics?.search_top_impression_share).padStart(6)} | ${pct(r.metrics?.search_outranking_share).padStart(6)} | ${pct(r.metrics?.search_overlap_rate).padStart(6)}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

process.exit(0)
