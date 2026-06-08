/**
 * Fresh 48hr reading — last 48hrs ending now (Friday May 22)
 * Window: May 21 + May 22
 * Compare to: May 19-20 (3-4 days post-change) and May 16-18 (pre-change)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

console.log(`\n=== FRESH 48HR READING — Friday May 22 ===\n`)

async function gadsDay(date) {
  const r = await c.query(`SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status='ENABLED' AND segments.date='${date}'`)
  let s=0,cl=0,i=0,cv=0,v=0
  const camps = []
  for (const x of r) {
    const cs = Number(x.metrics?.cost_micros||0)/1e6
    const ccl = Number(x.metrics?.clicks||0)
    const ci = Number(x.metrics?.impressions||0)
    const ccv = Number(x.metrics?.conversions||0)
    const cv2 = Number(x.metrics?.conversions_value||0)
    s+=cs; cl+=ccl; i+=ci; cv+=ccv; v+=cv2
    if (cs>0||ccl>0) camps.push({name:x.campaign.name, s:cs, cl:ccl, i:ci, cv:ccv, v:cv2})
  }
  return {total:{s,cl,i,cv,v}, camps}
}

console.log(`--- GOOGLE ADS DAILY (paid attributed) ---`)
const days = ['2026-05-19','2026-05-20','2026-05-21','2026-05-22']
const dayData = {}
for (const d of days) {
  const r = await gadsDay(d)
  dayData[d] = r
  const t = r.total
  const roas = t.s>0?(t.v/t.s).toFixed(2)+'x':'-'
  console.log(`  ${d} | $${t.s.toFixed(0).padStart(4)} | ${String(t.cl).padStart(4)} cl | ${String(t.i).padStart(5)} imp | ${t.cv.toFixed(1).padStart(4)} conv | $${t.v.toFixed(0).padStart(5)} | ${roas}`)
}

console.log(`\n--- LAST 48HR ROLLING (May 21-22) — PER CAMPAIGN ---`)
const lastTwo = ['2026-05-21','2026-05-22']
const campTotals = new Map()
for (const d of lastTwo) {
  for (const c of dayData[d].camps) {
    if (!campTotals.has(c.name)) campTotals.set(c.name,{s:0,cl:0,i:0,cv:0,v:0})
    const t = campTotals.get(c.name)
    t.s+=c.s; t.cl+=c.cl; t.i+=c.i; t.cv+=c.cv; t.v+=c.v
  }
}
let totS=0,totV=0
for (const [name,t] of [...campTotals.entries()].sort((a,b)=>b[1].s-a[1].s)) {
  const roas = t.s>0?(t.v/t.s).toFixed(2)+'x':'-'
  console.log(`  ${name.padEnd(40)} | $${t.s.toFixed(0).padStart(4)} | ${String(t.cl).padStart(4)} cl | ${String(t.i).padStart(5)} imp | ${t.cv.toFixed(1).padStart(4)} conv | $${t.v.toFixed(0).padStart(5)} | ${roas}`)
  totS+=t.s; totV+=t.v
}
console.log(`  TOTAL (48hr) | $${totS.toFixed(0)} spend | $${totV.toFixed(0)} rev | ${(totV/totS).toFixed(2)}x ROAS`)

// Compare to pre-change 48hr (May 17-18)
console.log(`\n--- VS PRE-CHANGE 48hr (May 17-18) ---`)
const pre = ['2026-05-17','2026-05-18']
let preS=0, preV=0
for (const d of pre) {
  const r = await gadsDay(d)
  preS+=r.total.s; preV+=r.total.v
}
console.log(`  PRE-CHANGE (May 17-18): $${preS.toFixed(0)} spend | $${preV.toFixed(0)} rev | ${(preV/preS).toFixed(2)}x ROAS`)
console.log(`  FRESH 48hr (May 21-22): $${totS.toFixed(0)} spend | $${totV.toFixed(0)} rev | ${(totV/totS).toFixed(2)}x ROAS`)
console.log(`  Δ Revenue: ${((totV-preV)/preV*100).toFixed(0)}% (${totV-preV>0?'+':''}$${(totV-preV).toFixed(0)})`)
console.log(`  Δ Spend: ${((totS-preS)/preS*100).toFixed(0)}% (${totS-preS>0?'+':''}$${(totS-preS).toFixed(0)})`)
console.log(`  Δ ROAS: ${((totV/totS)/(preV/preS)*100-100).toFixed(0)}% improvement`)

// Shopify last 48hr
console.log(`\n--- SHOPIFY ORDERS (last 48hrs, AEST date-based May 21-22) ---`)
const cutoff = '2026-05-20T14:00:00Z' // May 21 00:00 AEST
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}

let after=null, allOrders=[]
while (true) {
  const q = `query { orders(first: 250, ${after?'after:"'+after+'",':''} query: "created_at:>=${cutoff}", sortKey: CREATED_AT, reverse: true) { pageInfo { hasNextPage endCursor } edges { node { name createdAt totalPriceSet { shopMoney { amount } } customerJourneySummary { firstVisit { source sourceType utmParameters { source medium campaign } } } } } } }`
  const j = await gql(q)
  const e = j.data?.orders?.edges||[]
  allOrders.push(...e.map(x=>x.node))
  if (!j.data?.orders?.pageInfo?.hasNextPage) break
  after = j.data.orders.pageInfo.endCursor
}

function aestDay(iso){return new Date(new Date(iso).getTime()+10*60*60*1000).toISOString().slice(0,10)}
function categorize(v){if(!v)return 'unknown';const s=(v.source||v.sourceType||'').toLowerCase();const u=v.utmParameters||{};const us=(u.source||'').toLowerCase();const um=(u.medium||'').toLowerCase();const uc=(u.campaign||'').toLowerCase();if(s.includes('chatgpt')||s.includes('perplexity'))return 'AI';if(uc==='sag_organic'||(us==='google'&&um==='product_sync'))return 'Google_Free_Shopping';if(um==='paid'&&us==='google')return 'Google_PAID';if(um==='paid'&&us==='facebook')return 'Meta_PAID';if(s.includes('google')||us==='google')return 'Google_Organic';if(s.includes('facebook')||us==='facebook')return 'Facebook';if(s.includes('instagram')||us==='ig'||us==='instagram')return 'Instagram';if(s.includes('tiktok'))return 'TikTok';if(s.includes('email')||um==='email'||s.includes('klaviyo'))return 'Email';if(s.includes('direct')||s==='')return 'Direct';return 'Other'}

const byDay = {}
const byChan = {}
let totalRev=0
for (const o of allOrders) {
  const d = aestDay(o.createdAt)
  const amt = parseFloat(o.totalPriceSet?.shopMoney?.amount||0)
  totalRev += amt
  if (!byDay[d]) byDay[d] = {orders:0, rev:0}
  byDay[d].orders++; byDay[d].rev += amt
  const ch = categorize(o.customerJourneySummary?.firstVisit)
  if (!byChan[ch]) byChan[ch] = {orders:0, rev:0}
  byChan[ch].orders++; byChan[ch].rev += amt
}
for (const [d, v] of Object.entries(byDay).sort()) {
  console.log(`  ${d} | ${v.orders} orders | $${v.rev.toFixed(0)} | AOV $${(v.rev/v.orders).toFixed(0)}`)
}
console.log(`  TOTAL: ${allOrders.length} orders | $${totalRev.toFixed(0)} | AOV $${(totalRev/allOrders.length).toFixed(0)}`)

console.log(`\n--- CHANNEL MIX (last 48hr first-click) ---`)
for (const [ch,v] of Object.entries(byChan).sort((a,b)=>b[1].rev-a[1].rev)) {
  const pct = (v.rev/totalRev*100).toFixed(1)
  console.log(`  ${ch.padEnd(25)} ${String(v.orders).padStart(3)} orders | $${v.rev.toFixed(0).padStart(5)} | ${pct.padStart(5)}%`)
}

process.exit(0)
