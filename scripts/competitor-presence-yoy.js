/**
 * Competitor presence YoY — auction insights + PMAX category labels
 * Specifically tracks: Joyful Reveals + others
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const pct = n => n==null?'—':(Number(n)*100).toFixed(1)+'%'

console.log('\n=== COMPETITOR PRESENCE YoY ===\n')

// Search for Joyful Reveals and other named competitors in PMAX search-term insights
// (only available for last ~13 months)
console.log('━━━ COMPETITOR-NAMED SEARCH TERMS (PMAX insights, last 18mo) ━━━\n')
const pmaxAll = await c.query(`
  SELECT campaign_search_term_insight.category_label,
         metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
  FROM campaign_search_term_insight
  WHERE segments.date BETWEEN '2024-12-01' AND '2026-05-31'
    AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
`)
const competitorPatterns = {
  'joyful reveals':   /joyful/i,
  'celebrationhq':    /celebrationhq|celebration hq/i,
  'genderrevealcannon': /genderrevealcannon|gender reveal cannon\b.*\.com/i,
  'confettified':     /confettified/i,
  'aussiereveals':    /aussie ?reveals/i,
  'genderrevealexpress': /gender ?reveal ?express|grx/i,
  'kingconfetti':     /king ?confetti/i,
  'kaboomconfetti':   /kaboom ?confetti/i,
  'bowerbird':        /bowerbird/i,
  'amazon':           /amazon/i,
  'etsy':             /etsy/i,
  'kmart':            /kmart/i,
  'bigw':             /big ?w/i,
  'hug & kiss':       /hug ?(and|&) ?kiss|hugandkiss/i,
}
const byCompMonth = new Map()
const byComp = new Map()
for (const r of pmaxAll) {
  const lbl = (r.campaign_search_term_insight?.category_label||'').toLowerCase()
  for (const [name, pat] of Object.entries(competitorPatterns)) {
    if (pat.test(lbl)) {
      if (!byComp.has(name)) byComp.set(name, {imp:0,clk:0,conv:0,val:0,distinctTerms:new Set()})
      const x = byComp.get(name)
      x.imp += Number(r.metrics?.impressions||0)
      x.clk += Number(r.metrics?.clicks||0)
      x.conv += Number(r.metrics?.conversions||0)
      x.val += Number(r.metrics?.conversions_value||0)
      x.distinctTerms.add(lbl)
    }
  }
}

console.log('Competitor brand searches that PMAX matched (we showed up for these):')
console.log('Brand'.padEnd(28) + ' | Imp     | Clk  | Conv | Rev      | Distinct Terms')
console.log('-'.repeat(100))
for (const [name, x] of [...byComp.entries()].sort((a,b) => b[1].imp - a[1].imp)) {
  console.log(`${name.padEnd(28)} | ${String(x.imp).padStart(7)} | ${String(x.clk).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(6)}   | ${x.distinctTerms.size}`)
}

// Joyful Reveals specifically — monthly trend
console.log('\n\n━━━ JOYFUL REVEALS — monthly presence in OUR PMAX search-term insights ━━━')
console.log('When PMAX shows on queries containing "joyful" — likely brand+modifier searches\n')
console.log('Month   | Imp  | Clk | Rev')
const months = new Set()
for (const k of byCompMonth.keys()) {
  const [name, m] = k.split('|')
  if (name === 'joyful reveals') months.add(m)
}
for (const m of [...months].sort()) {
  const x = byCompMonth.get(`joyful reveals|${m}`)
  console.log(`${m} | ${String(x?.imp||0).padStart(4)} | ${String(x?.clk||0).padStart(3)} | $${(x?.val||0).toFixed(0)}`)
}

// GR Express specifically — were they ever a force?
console.log('\n\n━━━ GENDER REVEAL EXPRESS — monthly trend (if any) ━━━')
const grxMonths = new Set()
for (const k of byCompMonth.keys()) {
  if (k.startsWith('genderrevealexpress|')) grxMonths.add(k.split('|')[1])
}
if (grxMonths.size === 0) {
  console.log('  No "gender reveal express" search terms appeared in our PMAX matches at any point.')
} else {
  for (const m of [...grxMonths].sort()) {
    const x = byCompMonth.get(`genderrevealexpress|${m}`)
    console.log(`${m} | imp:${x?.imp||0} clk:${x?.clk||0} rev:$${(x?.val||0).toFixed(0)}`)
  }
}

// Search the last 18-mo OUR account for competitor mentions in search-term view (Search ads)
console.log('\n\n━━━ Search ads — competitor brand searches (last 18mo) ━━━\n')
const srch = await c.query(`
  SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.conversions
  FROM search_term_view
  WHERE segments.date BETWEEN '2024-12-01' AND '2026-05-31'
    AND metrics.impressions > 0
`)
const compSrch = new Map()
for (const r of srch) {
  const t = (r.search_term_view?.search_term||'').toLowerCase()
  for (const [name, pat] of Object.entries(competitorPatterns)) {
    if (pat.test(t)) {
      if (!compSrch.has(name)) compSrch.set(name, {imp:0,clk:0,conv:0,terms:new Set()})
      const x = compSrch.get(name)
      x.imp += Number(r.metrics?.impressions||0)
      x.clk += Number(r.metrics?.clicks||0)
      x.conv += Number(r.metrics?.conversions||0)
      x.terms.add(t)
    }
  }
}
for (const [name, x] of [...compSrch.entries()].sort((a,b)=>b[1].imp - a[1].imp)) {
  console.log(`${name.padEnd(28)} | imp:${String(x.imp).padStart(4)} clk:${String(x.clk).padStart(3)} conv:${x.conv.toFixed(1)} | ${x.terms.size} distinct terms`)
}

process.exit(0)
