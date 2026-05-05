/**
 * gads-audit-deep.js
 * Pulls keyword performance + search terms report for surgical audit.
 * Run: node scripts/gads-audit-deep.js
 */
import 'dotenv/config'
import { getKeywordPerformance, getSearchTermsReport, getCampaignPerformance } from '../server/lib/gads-queries.js'

const microsToDollars = (m) => (Number(m) / 1_000_000).toFixed(2)

async function main() {
  console.log('=== GOOGLE ADS DEEP AUDIT ===\n')

  // 1. Campaign performance (confirm baseline)
  console.log('--- CAMPAIGN PERFORMANCE (30d) ---')
  const campaigns = await getCampaignPerformance(30)
  campaigns.sort((a, b) => b.costMicros - a.costMicros)
  for (const c of campaigns) {
    const spend = microsToDollars(c.costMicros)
    const roas = c.costMicros > 0 ? (c.conversionsValue / (c.costMicros / 1_000_000)).toFixed(2) : '0'
    const cpa = c.conversions > 0 ? (c.costMicros / 1_000_000 / c.conversions).toFixed(2) : 'N/A'
    console.log(`  ${c.name} | Spend: $${spend} | Conv: ${c.conversions.toFixed(1)} | Value: $${c.conversionsValue.toFixed(2)} | ROAS: ${roas}x | CPA: $${cpa}`)
  }

  // 2. Keyword performance (all campaigns, 30d)
  console.log('\n--- KEYWORD PERFORMANCE (30d) ---')
  const keywords = await getKeywordPerformance(30)

  // Sort by cost descending
  keywords.sort((a, b) => b.costMicros - a.costMicros)

  console.log('\n  [ALL KEYWORDS BY SPEND]')
  for (const k of keywords) {
    const spend = microsToDollars(k.costMicros)
    const cpa = k.conversions > 0 ? `$${(k.costMicros / 1_000_000 / k.conversions).toFixed(2)}` : 'NO CONV'
    const ctr = k.impressions > 0 ? ((k.clicks / k.impressions) * 100).toFixed(1) : '0'
    console.log(`  ${k.campaignName} > ${k.adGroupName} | "${k.keywordText}" [${k.matchType}] | Spend: $${spend} | Clicks: ${k.clicks} | Conv: ${k.conversions} | CPA: ${cpa} | CTR: ${ctr}% | QS: ${k.qualityScore || '-'}`)
  }

  // 3. Flag bleeders: keywords with spend > $20 and 0 conversions
  const bleeders = keywords.filter(k => k.costMicros > 20_000_000 && k.conversions === 0)
  if (bleeders.length > 0) {
    console.log('\n  [BLEEDERS: $20+ spend, 0 conversions]')
    for (const k of bleeders) {
      console.log(`  ** ${k.campaignName} > "${k.keywordText}" [${k.matchType}] | WASTED: $${microsToDollars(k.costMicros)} | ${k.clicks} clicks | QS: ${k.qualityScore || '-'}`)
    }
  }

  // 4. Search terms report (min 1 click to catch more waste)
  console.log('\n--- SEARCH TERMS REPORT (30d, min 1 click) ---')
  const terms = await getSearchTermsReport(1, 30)
  terms.sort((a, b) => b.costMicros - a.costMicros)

  // Top 30 by spend
  console.log('\n  [TOP 30 SEARCH TERMS BY SPEND]')
  for (const t of terms.slice(0, 30)) {
    const spend = microsToDollars(t.costMicros)
    const conv = t.conversions > 0 ? `${t.conversions} conv` : 'NO CONV'
    console.log(`  ${t.campaignName} | "${t.searchTerm}" | $${spend} | ${t.clicks} clicks | ${conv}`)
  }

  // Wasted search terms: spend > $5, 0 conversions
  const wastedTerms = terms.filter(t => t.costMicros > 5_000_000 && t.conversions === 0)
  if (wastedTerms.length > 0) {
    console.log(`\n  [WASTED SEARCH TERMS: $5+ spend, 0 conv] (${wastedTerms.length} terms)`)
    let totalWaste = 0
    for (const t of wastedTerms) {
      const spend = microsToDollars(t.costMicros)
      totalWaste += t.costMicros
      console.log(`  ** ${t.campaignName} | "${t.searchTerm}" | WASTED: $${spend} | ${t.clicks} clicks`)
    }
    console.log(`\n  TOTAL WASTED ON 0-CONV TERMS: $${microsToDollars(totalWaste)}`)
  }

  // Summary stats
  console.log('\n--- SUMMARY ---')
  const totalKeywords = keywords.length
  const convertingKw = keywords.filter(k => k.conversions > 0).length
  const totalTerms = terms.length
  const convertingTerms = terms.filter(t => t.conversions > 0).length
  console.log(`  Keywords: ${totalKeywords} total, ${convertingKw} converting, ${totalKeywords - convertingKw} zero-conv`)
  console.log(`  Search terms: ${totalTerms} total, ${convertingTerms} converting, ${totalTerms - convertingTerms} zero-conv`)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
