/**
 * LP SURGERY TRIAGE — Identify top bleeders ranked by recoverable revenue.
 *
 * For each landing page with >5 clicks in 60d:
 * - Pull spend, clicks, conversions, value, CVR, ROAS
 * - Calculate benchmark (median CVR across all LPs)
 * - Recoverable value = current_spend × (benchmark_CVR - current_CVR) × AOV
 * - Rank by recoverable value
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
import { writeFileSync } from 'fs'

const c = getGadsCustomer()
const fmt = (d) => d.toISOString().slice(0, 10)
const days = (n) => fmt(new Date(Date.now() - n*86400000))

console.log(`\n=== LP SURGERY TRIAGE (60d window) ===\n`)

const lpRows = await c.query(`
  SELECT landing_page_view.unexpanded_final_url, campaign.name,
         metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.conversions_value, metrics.impressions
  FROM landing_page_view
  WHERE segments.date BETWEEN '${days(60)}' AND '${days(1)}'
    AND metrics.clicks > 5
  ORDER BY metrics.cost_micros DESC
`)

// Group by URL (strip query params for cleaner view, but keep variant pins to identify product-variant LPs)
const byLp = new Map()
for (const r of lpRows) {
  const url = r.landing_page_view?.unexpanded_final_url
  if (!url) continue
  const cur = byLp.get(url) || { url, campaigns: new Set(), clk: 0, conv: 0, sp: 0, val: 0, imp: 0 }
  cur.campaigns.add(r.campaign?.name)
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.sp += Number(r.metrics?.cost_micros || 0)/1e6
  cur.val += Number(r.metrics?.conversions_value || 0)
  cur.imp += Number(r.metrics?.impressions || 0)
  byLp.set(url, cur)
}

const lps = [...byLp.values()].map(x => ({
  ...x,
  campaigns: [...x.campaigns],
  cvr: x.clk > 0 ? x.conv / x.clk : 0,
  roas: x.sp > 0 ? x.val / x.sp : 0,
  aov: x.conv > 0 ? x.val / x.conv : 0,
}))

// Calculate benchmark CVR (median of LPs with at least 50 clicks)
const significant = lps.filter(x => x.clk >= 50)
significant.sort((a, b) => a.cvr - b.cvr)
const medianCvr = significant[Math.floor(significant.length/2)]?.cvr || 0.04
const accountAOV = lps.reduce((s,x) => s + x.val, 0) / lps.reduce((s,x) => s + x.conv, 0) || 90

console.log(`Benchmark median CVR (LPs >50 clicks): ${(medianCvr*100).toFixed(2)}%`)
console.log(`Account AOV: $${accountAOV.toFixed(0)}`)
console.log(`Total LPs analysed: ${lps.length} (${significant.length} with >50 clicks)\n`)

// Calculate recoverable value
for (const lp of lps) {
  const cvrGap = Math.max(0, medianCvr - lp.cvr)
  lp.recoverable = lp.clk * cvrGap * accountAOV  // clicks × cvr_gap × AOV
}

const surgeryTargets = lps
  .filter(x => x.clk >= 30 && x.cvr < medianCvr * 0.7 && x.sp > 30)  // significant clicks, CVR <70% of median, real money
  .sort((a, b) => b.recoverable - a.recoverable)

console.log('═══════════════════════════════════════════════════════════════')
console.log('TOP SURGERY TARGETS (ranked by 60d recoverable revenue)')
console.log('═══════════════════════════════════════════════════════════════\n')

let totalRecoverable = 0
for (const [i, lp] of surgeryTargets.slice(0, 15).entries()) {
  const path = lp.url.replace('https://genderrevealideas.com.au', '')
  totalRecoverable += lp.recoverable
  console.log(`#${i+1}. RECOVER $${lp.recoverable.toFixed(0)} / 60d  (~$${(lp.recoverable/2).toFixed(0)}/mo)`)
  console.log(`    URL: ${path.slice(0, 90)}`)
  console.log(`    Now: ${lp.clk} clicks, ${lp.conv.toFixed(0)} conv, ${(lp.cvr*100).toFixed(2)}% CVR, $${lp.sp.toFixed(0)} spent, $${lp.val.toFixed(0)} val, ${lp.roas.toFixed(2)}x ROAS`)
  console.log(`    Fix CVR to ${(medianCvr*100).toFixed(1)}% → +${(lp.clk * (medianCvr - lp.cvr)).toFixed(0)} additional conversions over this period`)
  console.log(`    Campaigns routing here: ${lp.campaigns.join(', ').slice(0, 100)}`)
  console.log()
}

console.log(`═══════════════════════════════════════════════════════════════`)
console.log(`TOTAL RECOVERABLE if top ${Math.min(15, surgeryTargets.length)} fixed: $${totalRecoverable.toFixed(0)} / 60d = ~$${(totalRecoverable/2).toFixed(0)}/mo`)
console.log(`═══════════════════════════════════════════════════════════════\n`)

// Also surface the WINNERS to learn from
console.log(`\n=== TOP CONVERTERS (LPs to model after) ===\n`)
const winners = lps.filter(x => x.clk >= 50).sort((a,b) => b.cvr - a.cvr).slice(0, 8)
for (const lp of winners) {
  const path = lp.url.replace('https://genderrevealideas.com.au', '')
  console.log(`  ${(lp.cvr*100).toFixed(1)}% CVR | ${lp.roas.toFixed(2)}x ROAS | ${lp.clk} clk | $${lp.sp.toFixed(0)} | ${path.slice(0, 80)}`)
}

writeFileSync('data/snapshots/gads-phase1/lp-surgery-triage.json', JSON.stringify({ medianCvr, accountAOV, surgeryTargets: surgeryTargets.slice(0, 20), winners }, null, 2))
console.log('\nSaved: data/snapshots/gads-phase1/lp-surgery-triage.json')
process.exit(0)
