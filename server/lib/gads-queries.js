/**
 * gads-queries.js
 * All read-side GAQL queries used by the Google Ads Agent rules engine.
 * Every query is wrapped in try/catch and returns [] on failure so one
 * broken query never kills a full scan.
 */
import { getGadsCustomer } from './gads-client.js'

const DEFAULT_LOOKBACK_DAYS = 30

function safeNum(v) {
  if (v == null) return 0
  if (typeof v === 'bigint') return Number(v)
  return Number(v) || 0
}

async function runQuery(label, gaql) {
  try {
    const customer = getGadsCustomer()
    return await customer.query(gaql)
  } catch (err) {
    console.error(`[GadsQueries] ${label} failed:`, err?.errors?.[0]?.message || err?.message || String(err))
    return []
  }
}

// ── Campaign performance ────────────────────────────────────────────────────

export async function getCampaignPerformance(lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  const rows = await runQuery('getCampaignPerformance', `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      campaign_budget.resource_name,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.clicks,
      metrics.impressions,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND segments.date DURING LAST_${lookbackDays}_DAYS
  `)

  // Aggregate per campaign (date segments get returned row-per-day otherwise)
  const byId = new Map()
  for (const r of rows) {
    const id = String(r.campaign?.id || '')
    if (!id) continue
    if (!byId.has(id)) {
      byId.set(id, {
        campaignId: id,
        name: r.campaign?.name || '',
        status: r.campaign?.status || '',
        channelType: r.campaign?.advertising_channel_type || '',
        budgetMicros: safeNum(r.campaign_budget?.amount_micros),
        budgetResourceName: r.campaign_budget?.resource_name || '',
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        clicks: 0,
        impressions: 0,
      })
    }
    const agg = byId.get(id)
    agg.costMicros       += safeNum(r.metrics?.cost_micros)
    agg.conversions      += safeNum(r.metrics?.conversions)
    agg.conversionsValue += safeNum(r.metrics?.conversions_value)
    agg.clicks           += safeNum(r.metrics?.clicks)
    agg.impressions      += safeNum(r.metrics?.impressions)
  }
  return [...byId.values()]
}

// ── Keyword performance ─────────────────────────────────────────────────────

export async function getKeywordPerformance(lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  const rows = await runQuery('getKeywordPerformance', `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.cpc_bid_micros,
      ad_group.id,
      ad_group.name,
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.conversions,
      metrics.clicks,
      metrics.impressions,
      metrics.ctr,
      metrics.average_cpc
    FROM keyword_view
    WHERE ad_group_criterion.status = 'ENABLED'
      AND campaign.status = 'ENABLED'
      AND segments.date DURING LAST_${lookbackDays}_DAYS
  `)

  const byKey = new Map()
  for (const r of rows) {
    const critId = String(r.ad_group_criterion?.criterion_id || '')
    const agId   = String(r.ad_group?.id || '')
    if (!critId || !agId) continue
    const key = `${agId}_${critId}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        criterionId: critId,
        adGroupId: agId,
        adGroupName: r.ad_group?.name || '',
        campaignId: String(r.campaign?.id || ''),
        campaignName: r.campaign?.name || '',
        keywordText: r.ad_group_criterion?.keyword?.text || '',
        matchType: r.ad_group_criterion?.keyword?.match_type || '',
        qualityScore: r.ad_group_criterion?.quality_info?.quality_score || null,
        cpcBidMicros: safeNum(r.ad_group_criterion?.cpc_bid_micros),
        costMicros: 0,
        conversions: 0,
        clicks: 0,
        impressions: 0,
      })
    }
    const agg = byKey.get(key)
    agg.costMicros  += safeNum(r.metrics?.cost_micros)
    agg.conversions += safeNum(r.metrics?.conversions)
    agg.clicks      += safeNum(r.metrics?.clicks)
    agg.impressions += safeNum(r.metrics?.impressions)
  }
  return [...byKey.values()]
}

// ── Search terms report ─────────────────────────────────────────────────────

export async function getSearchTermsReport(minClicks = 3, lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  const rows = await runQuery('getSearchTermsReport', `
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.ctr
    FROM search_term_view
    WHERE segments.date DURING LAST_${lookbackDays}_DAYS
      AND metrics.clicks >= ${minClicks}
  `)

  const byKey = new Map()
  for (const r of rows) {
    const term = r.search_term_view?.search_term || ''
    const campaignId = String(r.campaign?.id || '')
    if (!term || !campaignId) continue
    const key = `${campaignId}_${term}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        searchTerm: term,
        status: r.search_term_view?.status || '',
        campaignId,
        campaignName: r.campaign?.name || '',
        adGroupId: String(r.ad_group?.id || ''),
        adGroupName: r.ad_group?.name || '',
        costMicros: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
      })
    }
    const agg = byKey.get(key)
    agg.costMicros  += safeNum(r.metrics?.cost_micros)
    agg.clicks      += safeNum(r.metrics?.clicks)
    agg.impressions += safeNum(r.metrics?.impressions)
    agg.conversions += safeNum(r.metrics?.conversions)
  }
  return [...byKey.values()]
}

// ── Ads performance ─────────────────────────────────────────────────────────

export async function getAdPerformance(lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  const rows = await runQuery('getAdPerformance', `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.status,
      ad_group_ad.policy_summary.approval_status,
      ad_group.id,
      ad_group.name,
      campaign.id,
      campaign.name,
      metrics.ctr,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.cost_micros
    FROM ad_group_ad
    WHERE campaign.status = 'ENABLED'
      AND segments.date DURING LAST_${lookbackDays}_DAYS
  `)

  const byId = new Map()
  for (const r of rows) {
    const id = String(r.ad_group_ad?.ad?.id || '')
    if (!id) continue
    if (!byId.has(id)) {
      byId.set(id, {
        adId: id,
        name: r.ad_group_ad?.ad?.name || '',
        type: r.ad_group_ad?.ad?.type || '',
        status: r.ad_group_ad?.status || '',
        approvalStatus: r.ad_group_ad?.policy_summary?.approval_status || '',
        adGroupId: String(r.ad_group?.id || ''),
        adGroupName: r.ad_group?.name || '',
        campaignId: String(r.campaign?.id || ''),
        campaignName: r.campaign?.name || '',
        clicks: 0,
        impressions: 0,
        conversions: 0,
        costMicros: 0,
      })
    }
    const agg = byId.get(id)
    agg.clicks      += safeNum(r.metrics?.clicks)
    agg.impressions += safeNum(r.metrics?.impressions)
    agg.conversions += safeNum(r.metrics?.conversions)
    agg.costMicros  += safeNum(r.metrics?.cost_micros)
  }
  return [...byId.values()]
}

// ── Zero impression keywords ────────────────────────────────────────────────

export async function getZeroImpressionKeywords(zeroImpressionDays = 14) {
  const rows = await runQuery('getZeroImpressionKeywords', `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group.id,
      ad_group.name,
      campaign.id,
      campaign.name,
      metrics.impressions
    FROM keyword_view
    WHERE ad_group_criterion.status = 'ENABLED'
      AND campaign.status = 'ENABLED'
      AND segments.date DURING LAST_${zeroImpressionDays}_DAYS
  `)

  const byKey = new Map()
  for (const r of rows) {
    const critId = String(r.ad_group_criterion?.criterion_id || '')
    const agId = String(r.ad_group?.id || '')
    if (!critId || !agId) continue
    const key = `${agId}_${critId}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        criterionId: critId,
        adGroupId: agId,
        adGroupName: r.ad_group?.name || '',
        campaignId: String(r.campaign?.id || ''),
        campaignName: r.campaign?.name || '',
        keywordText: r.ad_group_criterion?.keyword?.text || '',
        matchType: r.ad_group_criterion?.keyword?.match_type || '',
        impressions: 0,
      })
    }
    byKey.get(key).impressions += safeNum(r.metrics?.impressions)
  }
  return [...byKey.values()].filter(k => k.impressions === 0)
}

// ── Shopping / Merchant Centre products performance ─────────────────────────

export async function getShoppingProductPerformance(lookbackDays = DEFAULT_LOOKBACK_DAYS) {
  const rows = await runQuery('getShoppingProductPerformance', `
    SELECT
      segments.product_item_id,
      segments.product_title,
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.date DURING LAST_${lookbackDays}_DAYS
  `)

  const byProduct = new Map()
  for (const r of rows) {
    const pid = r.segments?.product_item_id || ''
    if (!pid) continue
    if (!byProduct.has(pid)) {
      byProduct.set(pid, {
        productItemId: pid,
        productTitle: r.segments?.product_title || '',
        campaignId: String(r.campaign?.id || ''),
        campaignName: r.campaign?.name || '',
        costMicros: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        conversionsValue: 0,
      })
    }
    const agg = byProduct.get(pid)
    agg.costMicros       += safeNum(r.metrics?.cost_micros)
    agg.clicks           += safeNum(r.metrics?.clicks)
    agg.impressions      += safeNum(r.metrics?.impressions)
    agg.conversions      += safeNum(r.metrics?.conversions)
    agg.conversionsValue += safeNum(r.metrics?.conversions_value)
  }
  return [...byProduct.values()]
}
