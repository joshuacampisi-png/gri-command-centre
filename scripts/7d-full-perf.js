/**
 * 7-day full performance — Google paid + Shopify match + competitor visibility
 * Window: last 7 full days (yday-6 → yday)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

function dateNDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10) }
const END = dateNDaysAgo(1)   // yesterday full
const START = dateNDaysAgo(7) // 7 days back

console.log(`\n╔════════════════════════════════════════════════════════════╗`)
console.log(`║  7-DAY FULL PERFORMANCE REPORT                              ║`)
console.log(`║  Window: ${START} → ${END} (7 days)                  ║`)
console.log(`╚════════════════════════════════════════════════════════════╝\n`)

// ── 1. GOOGLE ADS 7-DAY ──
console.log(`━━━ 1. GOOGLE PAID — 7 day account totals ━━━\n`)
const gads = await c.query(`
  SELECT segments.date, campaign.name,
         metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value,
         metrics.search_impression_share, metrics.search_rank_lost_impression_share,
         metrics.search_budget_lost_impression_share
  FROM campaign
  WHERE segments.date BETWEEN '${START}' AND '${END}'
    AND campaign.status != 'REMOVED'
`)
const tot = {imp:0,clk:0,spend:0,conv:0,val:0,allConv:0,allVal:0,is:[],lr:[],lb:[]}
const byCamp = new Map()
for (const r of gads) {
  const m = r.metrics
  const sp = Number(m?.cost_micros||0)/1e6
  tot.imp += Number(m?.impressions||0); tot.clk += Number(m?.clicks||0); tot.spend += sp
  tot.conv += Number(m?.conversions||0); tot.val += Number(m?.conversions_value||0)
  tot.allConv += Number(m?.all_conversions||0); tot.allVal += Number(m?.all_conversions_value||0)
  if (m?.search_impression_share!=null) tot.is.push(Number(m.search_impression_share))
  if (m?.search_rank_lost_impression_share!=null) tot.lr.push(Number(m.search_rank_lost_impression_share))
  if (m?.search_budget_lost_impression_share!=null) tot.lb.push(Number(m.search_budget_lost_impression_share))
  const cn = r.campaign?.name||'?'
  if (!byCamp.has(cn)) byCamp.set(cn,{imp:0,clk:0,spend:0,conv:0,val:0})
  const x = byCamp.get(cn)
  x.imp += Number(m?.impressions||0); x.clk += Number(m?.clicks||0); x.spend += sp
  x.conv += Number(m?.conversions||0); x.val += Number(m?.conversions_value||0)
}
const avg = a => a.length?a.reduce((x,y)=>x+y,0)/a.length:0
console.log(`Spend:       $${tot.spend.toFixed(0)}  ($${(tot.spend/7).toFixed(0)}/day)`)
console.log(`Impressions: ${tot.imp.toLocaleString()}`)
console.log(`Clicks:      ${tot.clk}`)
console.log(`CTR:         ${(tot.clk/tot.imp*100).toFixed(2)}%`)
console.log(`CPC:         $${(tot.spend/tot.clk).toFixed(2)}`)
console.log(`Conversions: ${tot.conv.toFixed(1)}  (CPA $${(tot.spend/tot.conv).toFixed(2)})`)
console.log(`Revenue:     $${tot.val.toFixed(0)}  (ROAS ${(tot.val/tot.spend).toFixed(2)}x)`)
console.log(`All-Conv $:  $${tot.allVal.toFixed(0)}  (aMER ${(tot.allVal/tot.spend).toFixed(2)}x)`)
console.log(`Search IS:   ${(avg(tot.is)*100).toFixed(1)}%  · Lost-Rank ${(avg(tot.lr)*100).toFixed(1)}%  · Lost-Budget ${(avg(tot.lb)*100).toFixed(1)}%`)

console.log(`\nPer-campaign:`)
console.log('Campaign'.padEnd(38) + ' | Spend  | Rev    | ROAS  | Conv | aMER')
for (const [cn,x] of [...byCamp.entries()].sort((a,b)=>b[1].spend-a[1].spend)) {
  if (x.spend < 5) continue
  console.log(`${cn.slice(0,36).padEnd(38)} | $${x.spend.toFixed(0).padStart(4)}  | $${x.val.toFixed(0).padStart(5)} | ${(x.val/x.spend).toFixed(2)}x | ${x.conv.toFixed(1).padStart(4)}  |`)
}

// ── 2. SHOPIFY ORDERS 7-DAY ──
console.log(`\n\n━━━ 2. SHOPIFY ORDERS — same 7 days ━━━\n`)
async function getOrders(since, until) {
  const all = []
  let pageInfo = null, first = true
  while (first || pageInfo) {
    first = false
    const qs = pageInfo ? `limit=250&page_info=${pageInfo}` : `limit=250&created_at_min=${since}T00:00:00%2B10:00&created_at_max=${until}T23:59:59%2B10:00&status=any&financial_status=any&fields=id,name,created_at,total_price,referring_site,landing_site,source_name,cancelled_at`
    const r = await fetch(`https://${SHOP}/admin/api/2026-01/orders.json?${qs}`, { headers: { 'X-Shopify-Access-Token': TOKEN } })
    const j = await r.json()
    all.push(...(j.orders||[]))
    const link = r.headers.get('link') || ''
    const next = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    pageInfo = next?.[1] || null
    if (!pageInfo) break
  }
  return all
}
const orders = await getOrders(START, END)
const orderRev = orders.reduce((a,o)=>a+Number(o.total_price||0),0)
const byRef = new Map(), byUtmSource = new Map(), byUtmCampaign = new Map()
let withUtm = 0
for (const o of orders) {
  const ref = (o.referring_site || '(direct)').replace(/^https?:\/\//,'').split('/')[0].split('?')[0] || '(direct)'
  byRef.set(ref, (byRef.get(ref)||0)+1)
  const landing = o.landing_site || ''
  const utm_source = landing.match(/utm_source=([^&]+)/)?.[1]
  const utm_campaign = landing.match(/utm_campaign=([^&]+)/)?.[1]
  if (utm_source) { withUtm++; byUtmSource.set(utm_source, (byUtmSource.get(utm_source)||0)+1) }
  if (utm_campaign) byUtmCampaign.set(utm_campaign, (byUtmCampaign.get(utm_campaign)||0)+1)
}
console.log(`Orders:      ${orders.length}  (${(orders.length/7).toFixed(1)}/day)`)
console.log(`Revenue:     $${orderRev.toFixed(0)}  ($${(orderRev/7).toFixed(0)}/day)`)
console.log(`AOV:         $${(orderRev/orders.length).toFixed(0)}`)

console.log(`\nReferring sites:`)
for (const [r,n] of [...byRef.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(3)} | ${r}`)
console.log(`\nUTM source (${withUtm}/${orders.length} had utm_source):`)
for (const [s,n] of [...byUtmSource.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(3)} | utm_source=${s}`)
console.log(`\nUTM campaign (top 10):`)
for (const [c,n] of [...byUtmCampaign.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10)) console.log(`  ${String(n).padStart(3)} | ${c.slice(0,60)}`)

// ── 3. ATTRIBUTION MATCH ──
console.log(`\n\n━━━ 3. ATTRIBUTION CROSS-CHECK ━━━\n`)
console.log(`Google paid conv (Ads UI):    ${tot.conv.toFixed(1)}  (rev $${tot.val.toFixed(0)})`)
console.log(`Shopify total orders:         ${orders.length}    (rev $${orderRev.toFixed(0)})`)
console.log(`Gap:                          ${(orders.length-tot.conv).toFixed(1)} orders / $${(orderRev-tot.val).toFixed(0)}`)
console.log(`Sources of the gap (per Shopify referrer+UTM):`)
const sagOrganic = byUtmCampaign.get('sag_organic') || 0
const googleRef = (byRef.get('www.google.com')||0) - sagOrganic // approx organic
const directNoUtm = byRef.get('(direct)') || 0
const metaRef = (byRef.get('l.facebook.com')||0)+(byRef.get('l.instagram.com')||0)+(byRef.get('instagram.com')||0)+(byRef.get('facebook.com')||0)
console.log(`  Google Shopping FREE listings (sag_organic):  ${sagOrganic}`)
console.log(`  Organic Google search (no UTM):                ~${Math.max(0,googleRef)}`)
console.log(`  Direct / brand recall / Meta-assisted:         ${directNoUtm}`)
console.log(`  Meta referring sites (direct clicks):          ${metaRef}`)

// ── 4. SEARCH TERM VOLUME (Google Ads-side) ──
console.log(`\n\n━━━ 4. TOP SEARCH TERMS — what people typed (Google paid) ━━━\n`)
const st = await c.query(`
  SELECT search_term_view.search_term,
         metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE segments.date BETWEEN '${START}' AND '${END}'
    AND metrics.impressions > 0
`)
const stAgg = new Map()
for (const r of st) {
  const t = (r.search_term_view?.search_term||'').toLowerCase()
  if (!stAgg.has(t)) stAgg.set(t,{imp:0,clk:0,conv:0,val:0})
  const x = stAgg.get(t)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
const sortedSt = [...stAgg.entries()].sort((a,b)=>b[1].imp-a[1].imp)
console.log(`Total distinct terms: ${sortedSt.length}\n`)
console.log('Imp | Clk | CTR    | Conv | Rev   | Term')
for (const [t,x] of sortedSt.slice(0,15)) {
  const ctr = x.imp>0?(x.clk/x.imp*100).toFixed(1)+'%':'—'
  console.log(`${String(x.imp).padStart(3)} | ${String(x.clk).padStart(3)} | ${ctr.padStart(5)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(4)}  | ${t}`)
}

// ── 5. PMAX themes ──
console.log(`\n━━━ 5. PMAX SEARCH THEMES (what PMAX matched) ━━━\n`)
try {
  const pm = await c.query(`
    SELECT campaign_search_term_insight.category_label,
           metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
    FROM campaign_search_term_insight
    WHERE segments.date BETWEEN '${START}' AND '${END}'
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
  `)
  const pmAgg = new Map()
  for (const r of pm) {
    const l = (r.campaign_search_term_insight?.category_label||'').toLowerCase()
    if (!pmAgg.has(l)) pmAgg.set(l,{imp:0,clk:0,conv:0,val:0})
    const x = pmAgg.get(l)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.conv += Number(r.metrics?.conversions||0)
    x.val += Number(r.metrics?.conversions_value||0)
  }
  console.log('Imp   | Clk | Conv | Rev    | Theme')
  for (const [t,x] of [...pmAgg.entries()].sort((a,b)=>b[1].imp-a[1].imp).slice(0,15)) {
    console.log(`${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0).padStart(5)}  | "${t.slice(0,55)}"`)
  }
} catch(e) { console.log('  err:', e.message?.slice(0,100)) }

// ── 6. SERP / Competitor visibility ──
console.log(`\n\n━━━ 6. COMPETITOR VISIBILITY (live SERP scrape) ━━━\n`)
const TERMS = [
  'gender reveal',
  'gender reveal ideas',
  'gender reveal smoke bombs',
  'gender reveal cannon',
  'gender reveal extinguisher',
  'gender reveal poppers',
  'gender reveal powder',
  'gender reveal football',
]
async function scrape(kw) {
  try {
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
      method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
      body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:20}]),
    }).then(r=>r.json())
    const items = r.tasks?.[0]?.result?.[0]?.items?.filter(it=>it.type==='organic') || []
    const ours = items.find(it=>/genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
    const competitors = items.filter(it=>!/genderrevealideas/i.test(it.domain||''))
      .slice(0,5).map(it=>({rank:it.rank_absolute, domain:it.domain}))
    return { ourRank: ours?.rank_absolute || null, competitors }
  } catch(e) { return { ourRank: null, competitors: [], err: e.message } }
}
console.log('Keyword'.padEnd(34) + ' | Our # | Top 5 competitors')
console.log('-'.repeat(110))
for (const kw of TERMS) {
  const r = await scrape(kw)
  const us = r.ourRank ? `#${r.ourRank}` : 'NOT IN 20'
  const comps = r.competitors.map(c=>`#${c.rank} ${c.domain}`).join(' · ')
  console.log(`${kw.padEnd(34)} | ${us.padEnd(5)} | ${comps.slice(0,80)}`)
  await new Promise(r=>setTimeout(r,400))
}

process.exit(0)
