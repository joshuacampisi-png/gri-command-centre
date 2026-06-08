/**
 * May 20 — 48hr post-change report
 * Changes shipped: 5 SEO titles (May 19), 5 brand negatives removed (May 19),
 * 8 campaign-level negatives removed (May 20)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== MAY 20 — 48HR POST-CHANGE REPORT ===\n`)
console.log(`Window A (post-change): May 19-20`)
console.log(`Window B (control):     May 17-18`)
console.log()

// Per-campaign for both windows
async function pull(start, end, label) {
  console.log(`--- ${label} (${start} → ${end}) ---`)
  const rows = await c.query(`
    SELECT campaign.name, campaign.id,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE campaign.status='ENABLED'
      AND segments.date BETWEEN '${start}' AND '${end}'
  `)
  const byCamp = new Map()
  for (const r of rows) {
    const n = r.campaign?.name
    if (!byCamp.has(n)) byCamp.set(n, { spend:0, clicks:0, impr:0, conv:0, val:0 })
    const x = byCamp.get(n)
    x.spend += Number(r.metrics?.cost_micros||0)/1e6
    x.clicks += Number(r.metrics?.clicks||0)
    x.impr  += Number(r.metrics?.impressions||0)
    x.conv  += Number(r.metrics?.conversions||0)
    x.val   += Number(r.metrics?.conversions_value||0)
  }
  let tS=0, tC=0, tI=0, tCv=0, tV=0
  for (const [n, x] of [...byCamp.entries()].sort((a,b)=>b[1].spend-a[1].spend)) {
    const roas = x.spend>0 ? (x.val/x.spend).toFixed(2) : '-'
    console.log(`  ${n.padEnd(40)} | $${x.spend.toFixed(0).padStart(5)} | ${String(x.clicks).padStart(4)} clicks | ${String(x.impr).padStart(6)} impr | ${x.conv.toFixed(1).padStart(5)} conv | $${x.val.toFixed(0).padStart(5)} | ${roas}x`)
    tS+=x.spend; tC+=x.clicks; tI+=x.impr; tCv+=x.conv; tV+=x.val
  }
  const tRoas = tS>0 ? (tV/tS).toFixed(2) : '-'
  console.log(`  ${'TOTAL'.padEnd(40)} | $${tS.toFixed(0).padStart(5)} | ${String(tC).padStart(4)} clicks | ${String(tI).padStart(6)} impr | ${tCv.toFixed(1).padStart(5)} conv | $${tV.toFixed(0).padStart(5)} | ${tRoas}x`)
  console.log()
  return { total:{spend:tS,clicks:tC,impr:tI,conv:tCv,val:tV,roas:tRoas}, byCamp }
}

const A = await pull('2026-05-17','2026-05-18','CONTROL')
const B = await pull('2026-05-19','2026-05-20','POST-CHANGE')

// Deltas per campaign
console.log(`--- DELTAS (Post-change vs Control) ---`)
const allNames = new Set([...A.byCamp.keys(), ...B.byCamp.keys()])
for (const n of allNames) {
  const a = A.byCamp.get(n) || { spend:0, clicks:0, impr:0, conv:0, val:0 }
  const b = B.byCamp.get(n) || { spend:0, clicks:0, impr:0, conv:0, val:0 }
  const dImpr = b.impr - a.impr
  const dClicks = b.clicks - a.clicks
  const dConv = b.conv - a.conv
  const dVal = b.val - a.val
  const arrI = dImpr > 0 ? '↑' : dImpr < 0 ? '↓' : '='
  const arrV = dVal > 0 ? '↑' : dVal < 0 ? '↓' : '='
  console.log(`  ${n.padEnd(40)} | impr ${arrI}${Math.abs(dImpr)} | clicks ${dClicks>=0?'+':''}${dClicks} | conv ${dConv>=0?'+':''}${dConv.toFixed(1)} | rev ${arrV}$${Math.abs(dVal).toFixed(0)}`)
}

// Brand Defence keyword impressions (looking for "gender reveal ideas" to start serving)
console.log(`\n--- BRAND DEFENCE — Search Query Universe (May 19-20) ---`)
try {
  const sq = await c.query(`
    SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros
    FROM search_term_view
    WHERE campaign.id = 23425232813
      AND segments.date BETWEEN '2026-05-19' AND '2026-05-20'
    ORDER BY metrics.impressions DESC
    LIMIT 25
  `)
  if (!sq.length) console.log('  (no search-term data yet)')
  for (const r of sq) {
    const t = r.search_term_view?.search_term
    const i = Number(r.metrics?.impressions||0)
    const cl = Number(r.metrics?.clicks||0)
    const cv = Number(r.metrics?.conversions||0)
    const sp = Number(r.metrics?.cost_micros||0)/1e6
    console.log(`  "${t}" | ${i} impr | ${cl} clicks | ${cv} conv | $${sp.toFixed(2)}`)
  }
} catch(e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,100)}`) }

// Cannons keyword impressions
console.log(`\n--- SEARCH CANNONS — Search Query Universe (May 19-20) ---`)
try {
  const sq = await c.query(`
    SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros
    FROM search_term_view
    WHERE campaign.id = 21094179575
      AND segments.date BETWEEN '2026-05-19' AND '2026-05-20'
    ORDER BY metrics.impressions DESC
    LIMIT 25
  `)
  if (!sq.length) console.log('  (no search-term data yet)')
  for (const r of sq) {
    const t = r.search_term_view?.search_term
    const i = Number(r.metrics?.impressions||0)
    const cl = Number(r.metrics?.clicks||0)
    const cv = Number(r.metrics?.conversions||0)
    const sp = Number(r.metrics?.cost_micros||0)/1e6
    console.log(`  "${t}" | ${i} impr | ${cl} clicks | ${cv} conv | $${sp.toFixed(2)}`)
  }
} catch(e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,100)}`) }

process.exit(0)
