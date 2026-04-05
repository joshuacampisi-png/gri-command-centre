/**
 * cannons-coverage-check.js
 *
 * Before recommending the pause of any dead keyword, verify that pausing it
 * will NOT create a coverage gap. For each candidate dead keyword:
 *   - Pull the search-term report for the campaign
 *   - Find search terms that textually match the keyword (substring or
 *     normalised-token overlap)
 *   - Confirm those search terms are ALREADY being served by another live
 *     keyword in the campaign (matched_keyword field in the search term row)
 *
 * If a dead keyword has no overlapping search terms, it's safe to pause —
 * it's contributing nothing and nothing will be lost.
 *
 * If overlapping search terms exist and another keyword is catching them,
 * it's safe to pause — the traffic is cross-covered.
 *
 * If overlapping search terms exist but only the dead keyword would match,
 * that's a "WOULD CREATE GAP" warning — do NOT auto-recommend pause.
 *
 * Run: node scripts/cannons-coverage-check.js
 */

import 'dotenv/config'
import { getGadsCustomer, microsToDollars } from '../server/lib/gads-client.js'

const CAMPAIGN_ID = '21094179575'

const DEAD_CANDIDATES_ENABLED_AG = [
  // Powder Cannons (ad group 165478691408)
  { crit: '97473485',       text: 'fart',                         match: 'PHRASE' },
  { crit: '305203845298',   text: 'gender reveal powder cannon',  match: 'BROAD'  },
  { crit: '305857541428',   text: 'gender reveal cannon',         match: 'BROAD'  },
  { crit: '332400647189',   text: 'gender reveal powder',         match: 'PHRASE' },
  { crit: '343231168266',   text: 'gender reveal cannon',         match: 'PHRASE' },
  { crit: '422044211707',   text: 'gender powder cannon',         match: 'BROAD'  },
  { crit: '424025902745',   text: 'blue gender reveal cannon',    match: 'BROAD'  },
  { crit: '444018687482',   text: 'gender reveal powder cannon',  match: 'PHRASE' },
  { crit: '468283044690',   text: 'pink gender reveal cannon',    match: 'BROAD'  },
  { crit: '562256215836',   text: 'pink gender reveal cannon',    match: 'EXACT'  },
  { crit: '697447018519',   text: 'blue gender reveal cannon',    match: 'EXACT'  },
  { crit: '901783493931',   text: 'blue gender reveal cannon',    match: 'PHRASE' },
  { crit: '1262144165666',  text: 'gender powder cannon',         match: 'PHRASE' },
  // (crit 901783494931 pink gender reveal cannon PHRASE is also in the list but
  //  intent of the coverage check is identical to its exact sibling; include it too)
  { crit: '901783494931',   text: 'pink gender reveal cannon',    match: 'PHRASE' },
  // Confetti Cannons (ad group 165478691488)
  { crit: '296792952205',   text: 'gender reveal confetti poppers',match: 'BROAD' },
  { crit: '297020592929',   text: 'pink confetti cannon',          match: 'BROAD' },
  { crit: '305203822738',   text: 'gender reveal confetti',        match: 'BROAD' },
  { crit: '305203823018',   text: 'gender reveal confetti cannon', match: 'BROAD' },
  { crit: '305857482188',   text: 'gender confetti cannon',        match: 'BROAD' },
  { crit: '355715530263',   text: 'gender reveal confetti cannon', match: 'PHRASE'},
  { crit: '359160488521',   text: 'gender reveal confetti',        match: 'PHRASE'},
  { crit: '362791925699',   text: 'gender confetti cannon',        match: 'PHRASE'},
  { crit: '362791927139',   text: 'pink confetti cannon',          match: 'PHRASE'},
  { crit: '488630142872',   text: 'blue confetti cannon',          match: 'BROAD' },
]

function tokens(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean)
}

function tokenOverlap(a, b) {
  const A = new Set(tokens(a))
  const B = new Set(tokens(b))
  let hit = 0
  for (const t of A) if (B.has(t)) hit++
  return hit / Math.max(A.size, 1)
}

async function main() {
  const customer = getGadsCustomer()
  const fetchedAt = new Date().toISOString()

  // 90-day window, computed as explicit dates (DURING LAST_90_DAYS is not
  // a supported literal in this API version — only LAST_7_DAYS / LAST_30_DAYS).
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 90)
  const fromStr = startDate.toISOString().slice(0, 10)
  const toStr = endDate.toISOString().slice(0, 10)

  console.log(`\n[fetchedAt=${fetchedAt}] Pulling search terms for campaign ${CAMPAIGN_ID}, ${fromStr} → ${toStr}`)

  const searchTerms = await customer.query(`
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      segments.keyword.info.text,
      segments.keyword.info.match_type,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM search_term_view
    WHERE campaign.id = ${CAMPAIGN_ID}
      AND segments.date BETWEEN '${fromStr}' AND '${toStr}'
      AND metrics.impressions > 0
    ORDER BY metrics.impressions DESC
  `)

  console.log(`  fetched ${searchTerms.length} search terms (>0 imps, last 90d)`)

  // For each dead candidate, find overlapping search terms
  console.log('\n━━━━ COVERAGE CHECK (90d lookback) ━━━━')
  const results = []
  for (const dead of DEAD_CANDIDATES_ENABLED_AG) {
    const overlaps = []
    for (const st of searchTerms) {
      const term = st.search_term_view.search_term
      // Use token overlap >= 0.6 as proxy for "this dead keyword would have matched this query"
      if (tokenOverlap(dead.text, term) >= 0.6) {
        overlaps.push({
          term,
          matchedByKeyword: st.segments?.keyword?.info?.text || null,
          matchedByMatchType: st.segments?.keyword?.info?.match_type || null,
          impressions: Number(st.metrics.impressions || 0),
          conv: Number(st.metrics.conversions || 0),
          value: Number(st.metrics.conversions_value || 0),
        })
      }
    }
    // Who currently catches those queries?
    const coveredBy = new Map()
    for (const o of overlaps) {
      const k = o.matchedByKeyword || '(unknown)'
      if (!coveredBy.has(k)) coveredBy.set(k, { imps: 0, conv: 0, value: 0, terms: 0 })
      const e = coveredBy.get(k)
      e.imps += o.impressions; e.conv += o.conv; e.value += o.value; e.terms += 1
    }

    const totalImps = overlaps.reduce((s, o) => s + o.impressions, 0)
    const totalConv = overlaps.reduce((s, o) => s + o.conv, 0)
    const totalValue = overlaps.reduce((s, o) => s + o.value, 0)
    const uniqueTerms = new Set(overlaps.map(o => o.term)).size

    const verdict = totalImps === 0
      ? 'SAFE (zero overlapping query volume in 90d)'
      : [...coveredBy.keys()].filter(k => k && k.toLowerCase() !== dead.text.toLowerCase()).length > 0
        ? 'SAFE (queries already covered by another keyword)'
        : 'NEEDS REVIEW (would lose coverage)'

    results.push({ dead, overlaps: uniqueTerms, totalImps, totalConv, totalValue, coveredBy: Object.fromEntries(coveredBy), verdict })

    console.log(`\n  [${dead.match}] "${dead.text}"  (crit=${dead.crit})`)
    console.log(`     overlapping unique terms (90d): ${uniqueTerms}  total imps: ${totalImps}  conv: ${totalConv.toFixed(1)}  value: $${totalValue.toFixed(2)}`)
    if (uniqueTerms > 0) {
      console.log(`     currently covered by:`)
      for (const [k, v] of coveredBy.entries()) {
        console.log(`       "${k}" — ${v.terms} terms, ${v.imps} imps, ${v.conv.toFixed(1)} conv, $${v.value.toFixed(2)} value`)
      }
    }
    console.log(`     → ${verdict}`)
  }

  const safe = results.filter(r => r.verdict.startsWith('SAFE'))
  const review = results.filter(r => !r.verdict.startsWith('SAFE'))
  console.log(`\n━━━━ SUMMARY ━━━━`)
  console.log(`  SAFE to pause: ${safe.length}`)
  console.log(`  NEEDS REVIEW: ${review.length}`)
  if (review.length > 0) {
    console.log('\n  Review list:')
    for (const r of review) console.log(`    [${r.dead.match}] "${r.dead.text}"`)
  }

  const fs = await import('fs')
  fs.writeFileSync('/tmp/cannons-coverage-check.json', JSON.stringify({
    fetchedAt, campaignId: CAMPAIGN_ID, results
  }, null, 2))
  console.log('\n→ written to /tmp/cannons-coverage-check.json')
}

main().catch(err => {
  console.error('ERROR:', err?.errors || err?.message || err)
  process.exit(1)
})
