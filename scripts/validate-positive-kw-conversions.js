/**
 * Validate proposed EXACT-match keywords against historical search-term data
 * Pulls max-available window (13-15 months typical) from BOTH:
 *  - search_term_view (Search campaigns)
 *  - campaign_search_term_insight (PMAX category labels)
 *
 * Decision rule: keyword approved only if conversions > 0 in either source
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

const PROPOSED = [
  'gender reveal extinguisher',
  'gender reveal extinguisher australia',
  'gender reveal fire extinguisher',
  'smoke bomb gender reveal',
  'gender reveal smoke bomb',
  'gender reveal smoke bombs',
  'powder blaster gender reveal',
  'gender reveal powder blaster',
  'gender reveal colour blaster',
]

// Try widest possible window
const START_DATE = '2024-12-01'  // ~18 months back, Google retention is typically 15mo for search_term_view
const END_DATE = '2026-05-27'

console.log(`\n=== VALIDATING PROPOSED EXACT KEYWORDS — ${START_DATE} to ${END_DATE} ===\n`)

// Source 1: Search search_term_view (any Search campaign)
console.log('--- Source 1: SEARCH search_term_view ---')
const stData = new Map() // query -> {imp, clk, spend, conv, val}
try {
  const st = await c.query(`
    SELECT search_term_view.search_term, metrics.impressions, metrics.clicks,
           metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE segments.date BETWEEN '${START_DATE}' AND '${END_DATE}'
      AND metrics.impressions > 0
  `)
  for (const r of st) {
    const term = (r.search_term_view?.search_term||'').toLowerCase()
    if (!stData.has(term)) stData.set(term,{imp:0,clk:0,spend:0,conv:0,val:0})
    const x = stData.get(term)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.spend += Number(r.metrics?.cost_micros||0)/1e6
    x.conv += Number(r.metrics?.conversions||0)
    x.val += Number(r.metrics?.conversions_value||0)
  }
  console.log(`  Aggregated ${stData.size} unique search terms from Search`)
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

// Source 2: PMAX category labels
console.log('\n--- Source 2: PMAX campaign_search_term_insight ---')
const pmaxData = new Map()
try {
  const pm = await c.query(`
    SELECT campaign_search_term_insight.category_label,
           metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value
    FROM campaign_search_term_insight
    WHERE segments.date BETWEEN '${START_DATE}' AND '${END_DATE}'
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
  `)
  for (const r of pm) {
    const lbl = (r.campaign_search_term_insight?.category_label||'').toLowerCase()
    if (!pmaxData.has(lbl)) pmaxData.set(lbl,{imp:0,clk:0,conv:0,val:0})
    const x = pmaxData.get(lbl)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.conv += Number(r.metrics?.conversions||0)
    x.val += Number(r.metrics?.conversions_value||0)
  }
  console.log(`  Aggregated ${pmaxData.size} unique PMAX category labels`)
} catch(e) { console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message) }

// Match proposed against both sources
console.log('\n--- VALIDATION RESULTS ---\n')
console.log('Proposed keyword                            | Search imp/conv/rev    | PMAX imp/conv/rev      | Verdict')
console.log('-'.repeat(135))

const approved = []
const rejected = []
for (const kw of PROPOSED) {
  const kwLower = kw.toLowerCase()
  // Search: STRICT exact match only
  const searchExact = stData.get(kwLower) || {imp:0,clk:0,spend:0,conv:0,val:0}
  let searchTotal = {...searchExact}
  // PMAX: STRICT exact match only
  const pmaxExact = pmaxData.get(kwLower) || {imp:0,clk:0,conv:0,val:0}
  let pmaxTotal = {...pmaxExact}
  const totalConv = searchTotal.conv + pmaxTotal.conv
  const totalRev = searchTotal.val + pmaxTotal.val
  const totalImp = searchTotal.imp + pmaxTotal.imp
  const verdict = totalConv >= 1 ? '✓ APPROVED' : (totalImp > 100 ? '⚠ HIGH IMP NO CONV' : '✗ INSUFFICIENT DATA')

  console.log(`${kw.padEnd(43)} | ${String(searchTotal.imp).padStart(5)}/${searchTotal.conv.toFixed(1).padStart(4)}/$${searchTotal.val.toFixed(0).padStart(4)} | ${String(pmaxTotal.imp).padStart(6)}/${pmaxTotal.conv.toFixed(1).padStart(4)}/$${pmaxTotal.val.toFixed(0).padStart(5)} | ${verdict}`)

  if (totalConv >= 1) approved.push({kw, conv: totalConv, rev: totalRev, imp: totalImp})
  else rejected.push({kw, conv: totalConv, imp: totalImp})
}

console.log('\n--- APPROVED (will ship) ---')
for (const a of approved) console.log(`  ✓ [${a.kw}] EXACT — ${a.conv.toFixed(1)} historical conv, $${a.rev.toFixed(0)} revenue, ${a.imp} imp`)
console.log('\n--- REJECTED ---')
for (const r of rejected) console.log(`  ✗ [${r.kw}] — ${r.conv.toFixed(1)} conv, ${r.imp} imp`)

process.exit(0)
