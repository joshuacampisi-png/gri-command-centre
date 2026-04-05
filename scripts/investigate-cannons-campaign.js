/**
 * investigate-cannons-campaign.js
 *
 * One-off investigation for Josh's questions about the "GRI | Search | Cannons"
 * recommendation (campaign id 21094179575). Answers:
 *   - Is this branded or generic search? (keyword list + search terms report)
 *   - What's the actual daily budget, and how does it relate to the "$852"
 *     figure on the card?
 *   - What's the search volume (impressions, clicks)?
 *   - New vs returning customer split — is it acquisition or repeat?
 *   - Is it a sales campaign or awareness?
 *
 * Run: node scripts/investigate-cannons-campaign.js
 */

import 'dotenv/config'
import { getGadsCustomer, microsToDollars } from '../server/lib/gads-client.js'

const CAMPAIGN_ID = '21094179575'

function fmt$(n) { return '$' + (n ?? 0).toFixed(2) }
function fmtPct(n) { return (n * 100).toFixed(2) + '%' }

async function main() {
  const customer = getGadsCustomer()

  // ─── 1. Campaign metadata + budget ──────────────────────────────────────
  console.log('\n━━━━ 1. CAMPAIGN METADATA ━━━━')
  const campaign = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign_budget.amount_micros,
      campaign_budget.delivery_method,
      campaign.target_cpa.target_cpa_micros,
      campaign.target_roas.target_roas
    FROM campaign
    WHERE campaign.id = ${CAMPAIGN_ID}
  `)
  if (!campaign.length) {
    console.log('NO CAMPAIGN FOUND'); return
  }
  const c = campaign[0]
  console.log('Name:', c.campaign.name)
  console.log('Status:', c.campaign.status, '(2=ENABLED, 3=PAUSED)')
  console.log('Channel:', c.campaign.advertising_channel_type, '(2=SEARCH)')
  console.log('Bidding strategy:', c.campaign.bidding_strategy_type)
  console.log('Daily budget:', fmt$(microsToDollars(c.campaign_budget.amount_micros)))
  console.log('Delivery:', c.campaign_budget.delivery_method)
  if (c.campaign.target_roas?.target_roas) {
    console.log('Target ROAS:', c.campaign.target_roas.target_roas.toFixed(2) + 'x')
  }

  // ─── 2. 30-day performance ─────────────────────────────────────────────
  console.log('\n━━━━ 2. 30-DAY PERFORMANCE (campaign-level) ━━━━')
  const perf = await customer.query(`
    SELECT
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.all_conversions
    FROM campaign
    WHERE campaign.id = ${CAMPAIGN_ID}
      AND segments.date DURING LAST_30_DAYS
  `)
  const p = perf[0]?.metrics || {}
  const cost = microsToDollars(p.cost_micros || 0)
  const clicks = Number(p.clicks || 0)
  const imps = Number(p.impressions || 0)
  const convs = Number(p.conversions || 0)
  const convValue = Number(p.conversions_value || 0)
  console.log('Spend:', fmt$(cost))
  console.log('Clicks:', clicks)
  console.log('Impressions:', imps)
  console.log('CTR:', fmtPct(p.ctr || 0))
  console.log('Avg CPC:', fmt$(microsToDollars(p.average_cpc || 0)))
  console.log('Conversions:', convs.toFixed(2))
  console.log('Conversion value:', fmt$(convValue))
  console.log('ROAS:', cost > 0 ? (convValue / cost).toFixed(3) + 'x' : 'n/a')
  console.log('Avg daily clicks:', (clicks / 30).toFixed(1))
  console.log('Avg daily impressions:', (imps / 30).toFixed(0))
  console.log('Avg daily spend:', fmt$(cost / 30))

  // ─── 3. Keywords in this campaign ───────────────────────────────────────
  console.log('\n━━━━ 3. KEYWORDS (last 30d, sorted by spend) ━━━━')
  const keywords = await customer.query(`
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group.name,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM keyword_view
    WHERE campaign.id = ${CAMPAIGN_ID}
      AND segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC
  `)
  console.log(`Total keywords: ${keywords.length}`)
  for (const k of keywords.slice(0, 20)) {
    const m = k.metrics
    const kwCost = microsToDollars(m.cost_micros || 0)
    const kwConvVal = Number(m.conversions_value || 0)
    const kwClicks = Number(m.clicks || 0)
    const kwImps = Number(m.impressions || 0)
    const matchType = k.ad_group_criterion.keyword.match_type
    const roas = kwCost > 0 ? (kwConvVal / kwCost).toFixed(2) + 'x' : '—'
    console.log(
      `  [${matchType}] "${k.ad_group_criterion.keyword.text}"`,
      `imp=${kwImps}`,
      `clk=${kwClicks}`,
      `spend=${fmt$(kwCost)}`,
      `conv=${Number(m.conversions || 0).toFixed(1)}`,
      `val=${fmt$(kwConvVal)}`,
      `roas=${roas}`,
    )
  }

  // ─── 4. Search terms report (actual user queries) ──────────────────────
  console.log('\n━━━━ 4. SEARCH TERMS (top 25 by impressions) ━━━━')
  const searchTerms = await customer.query(`
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM search_term_view
    WHERE campaign.id = ${CAMPAIGN_ID}
      AND segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
    LIMIT 25
  `)
  console.log(`Top search terms returned: ${searchTerms.length}`)
  let brandedImps = 0, genericImps = 0, brandedConv = 0, genericConv = 0, brandedSpend = 0, genericSpend = 0
  const BRAND_TOKENS = ['gender reveal idea', 'gri', 'genderrevealideas', 'gender reveal ideas']
  for (const st of searchTerms) {
    const term = st.search_term_view.search_term.toLowerCase()
    const m = st.metrics
    const stCost = microsToDollars(m.cost_micros || 0)
    const stImps = Number(m.impressions || 0)
    const stClicks = Number(m.clicks || 0)
    const stConv = Number(m.conversions || 0)
    const stConvVal = Number(m.conversions_value || 0)
    const isBranded = BRAND_TOKENS.some(t => term.includes(t))
    if (isBranded) {
      brandedImps += stImps; brandedConv += stConv; brandedSpend += stCost
    } else {
      genericImps += stImps; genericConv += stConv; genericSpend += stCost
    }
    console.log(
      `  ${isBranded ? '[B]' : '[G]'} "${term}"`,
      `imp=${stImps}`,
      `clk=${stClicks}`,
      `spend=${fmt$(stCost)}`,
      `conv=${stConv.toFixed(1)}`,
      `val=${fmt$(stConvVal)}`,
    )
  }
  console.log('\n  BRANDED totals (top 25):',
    `imps=${brandedImps}`, `spend=${fmt$(brandedSpend)}`, `conv=${brandedConv.toFixed(1)}`)
  console.log('  GENERIC totals (top 25):',
    `imps=${genericImps}`, `spend=${fmt$(genericSpend)}`, `conv=${genericConv.toFixed(1)}`)

  // ─── 5. New vs returning customer segmentation ─────────────────────────
  console.log('\n━━━━ 5. NEW vs RETURNING CUSTOMERS (Google Ads segment) ━━━━')
  try {
    const segRows = await customer.query(`
      SELECT
        segments.new_versus_returning_customers,
        metrics.conversions,
        metrics.conversions_value,
        metrics.cost_micros
      FROM campaign
      WHERE campaign.id = ${CAMPAIGN_ID}
        AND segments.date DURING LAST_30_DAYS
    `)
    for (const row of segRows) {
      const label = row.segments.new_versus_returning_customers
      const conv = Number(row.metrics.conversions || 0)
      const val = Number(row.metrics.conversions_value || 0)
      const cst = microsToDollars(row.metrics.cost_micros || 0)
      console.log(`  ${label}: conv=${conv.toFixed(2)}, value=${fmt$(val)}, cost=${fmt$(cst)}`)
    }
  } catch (err) {
    console.log('  (segment not available:', err?.errors?.[0]?.message || err.message, ')')
  }

  console.log('\n━━━━ DONE ━━━━\n')
}

main().catch(err => {
  console.error('ERROR:', err?.errors || err?.message || err)
  process.exit(1)
})
