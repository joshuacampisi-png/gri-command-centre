/**
 * gads-live.js
 *
 * Live Google Ads data fetcher with 5-minute in-memory TTL cache.
 *
 * RULE: Every piece of data that feeds into a recommendation card MUST come
 * through this module. No stored JSON blobs. Every return value carries a
 * `fetchedAt` ISO timestamp. If the cache is warm (< TTL), the cached value
 * is returned; otherwise a fresh GAQL query fires.
 *
 * New enrichment queries that gads-queries.js doesn't have:
 *   - getSearchTermsEnriched: includes matched-keyword segmentation + conv value
 *   - getCampaignKeywordsLive: includes ad_group.status + negative flag
 *   - classifyBrandedGeneric: branded/generic split on a campaign's search terms
 *   - getCoverageCrossCheck: whether dead keywords are cross-covered by siblings
 *   - getCampaignMetadataLive: budget, bidding strategy, channel type, target ROAS
 *
 * Also re-exports cached versions of the 6 original gads-queries.js functions.
 */

import { getGadsCustomer, microsToDollars } from './gads-client.js'
import {
  getCampaignPerformance,
  getKeywordPerformance,
  getSearchTermsReport,
  getAdPerformance,
  getZeroImpressionKeywords,
  getShoppingProductPerformance,
} from './gads-queries.js'

// ── TTL cache ──────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const _cache = new Map()

function cacheKey(fn, args) {
  return `${fn}::${JSON.stringify(args)}`
}

function getCached(key) {
  const entry = _cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key)
    return null
  }
  return entry
}

function setCache(key, data) {
  _cache.set(key, { data, ts: Date.now(), fetchedAt: new Date().toISOString() })
  return data
}

/**
 * Wrap any async fetch function with the TTL cache.
 * Returns { data, fetchedAt }.
 */
async function cached(label, args, fetchFn) {
  const key = cacheKey(label, args)
  const hit = getCached(key)
  if (hit) return { data: hit.data, fetchedAt: hit.fetchedAt, cacheHit: true }
  const data = await fetchFn()
  setCache(key, data)
  return { data, fetchedAt: new Date().toISOString(), cacheHit: false }
}

/** Force-invalidate all cache entries. Call after a mutation. */
export function invalidateCache() {
  _cache.clear()
}

/** Force-invalidate entries matching a prefix. */
export function invalidateCachePrefix(prefix) {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key)
  }
}

// ── Cached wrappers for existing gads-queries.js functions ─────────────────

export function getCampaignPerformanceLive(lookbackDays = 30) {
  return cached('campaignPerf', [lookbackDays], () => getCampaignPerformance(lookbackDays))
}

export function getKeywordPerformanceLive(lookbackDays = 30) {
  return cached('keywordPerf', [lookbackDays], () => getKeywordPerformance(lookbackDays))
}

export function getSearchTermsReportLive(minClicks = 3, lookbackDays = 30) {
  return cached('searchTerms', [minClicks, lookbackDays], () => getSearchTermsReport(minClicks, lookbackDays))
}

export function getAdPerformanceLive(lookbackDays = 30) {
  return cached('adPerf', [lookbackDays], () => getAdPerformance(lookbackDays))
}

export function getZeroImpressionKeywordsLive(zeroImpressionDays = 14) {
  return cached('zeroImpKws', [zeroImpressionDays], () => getZeroImpressionKeywords(zeroImpressionDays))
}

export function getShoppingProductPerformanceLive(lookbackDays = 30) {
  return cached('shoppingPerf', [lookbackDays], () => getShoppingProductPerformance(lookbackDays))
}

// ── New enrichment queries ─────────────────────────────────────────────────

const MATCH_TYPE_LABELS = { 2: 'EXACT', 3: 'PHRASE', 4: 'BROAD' }

function safeNum(v) {
  if (v == null) return 0
  if (typeof v === 'bigint') return Number(v)
  return Number(v) || 0
}

/**
 * Campaign metadata: budget, bidding strategy, channel type, target ROAS/CPA.
 * Used by the pre-flight to understand what kind of campaign we're touching.
 */
export function getCampaignMetadataLive(campaignId) {
  return cached('campaignMeta', [campaignId], async () => {
    const customer = getGadsCustomer()
    const rows = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.bidding_strategy_type,
        campaign_budget.amount_micros,
        campaign_budget.delivery_method,
        campaign_budget.resource_name,
        campaign.target_roas.target_roas
      FROM campaign
      WHERE campaign.id = ${campaignId}
    `)
    if (!rows.length) return null
    const c = rows[0]
    return {
      campaignId: String(c.campaign.id),
      name: c.campaign.name,
      status: c.campaign.status,
      channelType: c.campaign.advertising_channel_type,
      biddingStrategy: c.campaign.bidding_strategy_type,
      dailyBudgetAud: microsToDollars(c.campaign_budget?.amount_micros || 0),
      budgetResourceName: c.campaign_budget?.resource_name || '',
      deliveryMethod: c.campaign_budget?.delivery_method,
      targetRoas: c.campaign?.target_roas?.target_roas || null,
    }
  })
}

/**
 * All keywords in a campaign with ad_group status + negative flag.
 * Fixes the Phase 1 bug where the old engine flagged keywords in paused
 * ad groups as actionable.
 */
export function getCampaignKeywordsLive(campaignId, lookbackDays = 30) {
  return cached('campaignKws', [campaignId, lookbackDays], async () => {
    const customer = getGadsCustomer()
    const rows = await customer.query(`
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.negative,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions,
        metrics.conversions_value
      FROM keyword_view
      WHERE campaign.id = ${campaignId}
        AND segments.date DURING LAST_${lookbackDays}_DAYS
        AND ad_group_criterion.status = 'ENABLED'
    `)

    return rows.map(r => ({
      criterionId: String(r.ad_group_criterion.criterion_id),
      text: r.ad_group_criterion.keyword.text,
      matchType: MATCH_TYPE_LABELS[r.ad_group_criterion.keyword.match_type] || String(r.ad_group_criterion.keyword.match_type),
      matchTypeNum: r.ad_group_criterion.keyword.match_type,
      isNegative: !!r.ad_group_criterion.negative,
      adGroupId: String(r.ad_group.id),
      adGroupName: r.ad_group.name,
      adGroupStatus: r.ad_group.status, // 2=ENABLED, 3=PAUSED, 4=REMOVED
      adGroupEnabled: r.ad_group.status === 2,
      impressions: safeNum(r.metrics?.impressions),
      clicks: safeNum(r.metrics?.clicks),
      cost: microsToDollars(r.metrics?.cost_micros || 0),
      conversions: safeNum(r.metrics?.conversions),
      conversionsValue: safeNum(r.metrics?.conversions_value),
    }))
  })
}

/**
 * Search terms with matched-keyword segmentation + conversion values.
 * Richer than gads-queries.js getSearchTermsReport which lacks conv value
 * and keyword matching info.
 */
export function getSearchTermsEnriched(campaignId, lookbackDays = 30) {
  return cached('searchTermsEnriched', [campaignId, lookbackDays], async () => {
    const customer = getGadsCustomer()
    const rows = await customer.query(`
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
      WHERE campaign.id = ${campaignId}
        AND segments.date DURING LAST_${lookbackDays}_DAYS
        AND metrics.impressions > 0
      ORDER BY metrics.impressions DESC
    `)

    // Aggregate per unique search term (rows split by matched keyword segment)
    const agg = new Map()
    for (const r of rows) {
      const term = r.search_term_view.search_term.toLowerCase().trim()
      if (!agg.has(term)) {
        agg.set(term, {
          term,
          status: r.search_term_view.status,
          impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionsValue: 0,
          matchedBy: new Set(), matchTypes: new Set(),
        })
      }
      const a = agg.get(term)
      a.impressions += safeNum(r.metrics?.impressions)
      a.clicks += safeNum(r.metrics?.clicks)
      a.cost += microsToDollars(r.metrics?.cost_micros || 0)
      a.conversions += safeNum(r.metrics?.conversions)
      a.conversionsValue += safeNum(r.metrics?.conversions_value)
      if (r.segments?.keyword?.info?.text) {
        a.matchedBy.add(r.segments.keyword.info.text)
        a.matchTypes.add(r.segments.keyword.info.match_type)
      }
    }

    return [...agg.values()].map(a => ({
      ...a,
      matchedBy: [...a.matchedBy],
      matchTypes: [...a.matchTypes],
      ctr: a.impressions > 0 ? +(a.clicks / a.impressions * 100).toFixed(2) : 0,
      cpa: a.conversions > 0 ? +(a.cost / a.conversions).toFixed(2) : null,
      roas: a.cost > 0 ? +(a.conversionsValue / a.cost).toFixed(2) : null,
    }))
  })
}

/**
 * Branded vs generic classification for a campaign's search terms.
 *
 * BRAND_TOKENS is GRI-specific. In Phase 4 this should be extracted into
 * the agent config so it's customisable per account.
 */
const BRAND_TOKENS = [
  'gender reveal idea', 'gender reveal ideas', 'gri',
  'genderrevealideas', 'gender reveal ideas .com',
]

export function classifyBrandedGeneric(campaignId, lookbackDays = 30) {
  return cached('brandGeneric', [campaignId, lookbackDays], async () => {
    const { data: terms } = await getSearchTermsEnriched(campaignId, lookbackDays)
    let brandedImps = 0, genericImps = 0, brandedConv = 0, genericConv = 0
    let brandedSpend = 0, genericSpend = 0, brandedRev = 0, genericRev = 0

    const branded = []
    const generic = []

    for (const t of terms) {
      const isBranded = BRAND_TOKENS.some(b => t.term.includes(b))
      if (isBranded) {
        brandedImps += t.impressions
        brandedConv += t.conversions
        brandedSpend += t.cost
        brandedRev += t.conversionsValue
        branded.push(t)
      } else {
        genericImps += t.impressions
        genericConv += t.conversions
        genericSpend += t.cost
        genericRev += t.conversionsValue
        generic.push(t)
      }
    }

    const totalImps = brandedImps + genericImps
    return {
      brandedPct: totalImps > 0 ? +(brandedImps / totalImps * 100).toFixed(1) : 0,
      genericPct: totalImps > 0 ? +(genericImps / totalImps * 100).toFixed(1) : 0,
      branded: {
        count: branded.length,
        impressions: brandedImps,
        conversions: +brandedConv.toFixed(2),
        spend: +brandedSpend.toFixed(2),
        revenue: +brandedRev.toFixed(2),
      },
      generic: {
        count: generic.length,
        impressions: genericImps,
        conversions: +genericConv.toFixed(2),
        spend: +genericSpend.toFixed(2),
        revenue: +genericRev.toFixed(2),
      },
      topBranded: branded.slice(0, 10),
      topGeneric: generic.sort((a, b) => b.impressions - a.impressions).slice(0, 20),
      isTofAcquisition: genericImps > brandedImps * 5, // >83% generic = likely TOF
    }
  })
}

/**
 * Cross-coverage check: for a list of dead keyword texts, verify that
 * sibling keywords in the same campaign are already catching the same
 * search queries. Uses token-overlap heuristic against 30d search terms.
 *
 * Returns per-keyword: { text, isCovered, coveredBy[], verdict }
 */
export function getCoverageCrossCheck(campaignId, deadKeywordTexts, lookbackDays = 30) {
  return cached('coverageCheck', [campaignId, deadKeywordTexts.sort().join('|'), lookbackDays], async () => {
    const { data: terms } = await getSearchTermsEnriched(campaignId, lookbackDays)

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

    const results = []
    for (const deadText of deadKeywordTexts) {
      const overlaps = terms.filter(t => tokenOverlap(deadText, t.term) >= 0.6)
      const totalImps = overlaps.reduce((s, o) => s + o.impressions, 0)
      const coveredBy = [...new Set(overlaps.flatMap(o => o.matchedBy))]
        .filter(kw => kw.toLowerCase() !== deadText.toLowerCase())

      const verdict = totalImps === 0
        ? 'safe-zero-volume'
        : coveredBy.length > 0
          ? 'safe-cross-covered'
          : 'needs-review'

      results.push({
        text: deadText,
        overlappingTerms: overlaps.length,
        overlappingImpressions: totalImps,
        coveredBy,
        verdict,
      })
    }

    const allSafe = results.every(r => r.verdict.startsWith('safe'))
    return { results, allSafe, safeCount: results.filter(r => r.verdict.startsWith('safe')).length }
  })
}

/**
 * Replacement keyword candidates: search terms that converted but don't
 * have a dedicated keyword yet. Used by hygiene cards.
 */
export function getReplacementCandidates(campaignId, lookbackDays = 30) {
  return cached('replacementCandidates', [campaignId, lookbackDays], async () => {
    const [{ data: terms }, { data: keywords }] = await Promise.all([
      getSearchTermsEnriched(campaignId, lookbackDays),
      getCampaignKeywordsLive(campaignId, lookbackDays),
    ])

    const enabledTexts = new Set(keywords.map(k => k.text.toLowerCase().trim()))

    // HEAD_TERM_BLOCKLIST: too broad for a hygiene card, needs strategic placement
    const HEAD_BLOCKLIST = new Set(['gender reveal', 'gender reveals', 'gender reveal idea', 'gender reveal ideas'])

    return terms
      .filter(t => t.conversions >= 1)
      .filter(t => !enabledTexts.has(t.term))
      .filter(t => !HEAD_BLOCKLIST.has(t.term))
      .sort((a, b) => (b.conversions - a.conversions) || (b.impressions - a.impressions))
      .map(t => ({
        term: t.term,
        impressions: t.impressions,
        clicks: t.clicks,
        cost: +t.cost.toFixed(2),
        conversions: +t.conversions.toFixed(2),
        conversionsValue: +t.conversionsValue.toFixed(2),
        ctr: t.ctr,
        cpa: t.cpa,
        roas: t.roas,
        matchedBy: t.matchedBy,
      }))
  })
}

/**
 * Full campaign context bundle: everything the pre-flight + card generator
 * needs in one call. Runs multiple live fetches in parallel.
 */
export async function getCampaignContextLive(campaignId, lookbackDays = 30) {
  const [meta, keywords, brandGeneric, campaignPerf] = await Promise.all([
    getCampaignMetadataLive(campaignId),
    getCampaignKeywordsLive(campaignId, lookbackDays),
    classifyBrandedGeneric(campaignId, lookbackDays),
    getCampaignPerformanceLive(lookbackDays),
  ])

  const thisCampaign = (campaignPerf.data || []).find(c => c.campaignId === String(campaignId))
  const liveKws = (keywords.data || []).filter(k => k.adGroupEnabled && !k.isNegative && k.impressions > 0)
  const deadKws = (keywords.data || []).filter(k => k.adGroupEnabled && !k.isNegative && k.impressions === 0)
  const deadInPausedAgs = (keywords.data || []).filter(k => !k.adGroupEnabled && k.impressions === 0)

  return {
    fetchedAt: meta.fetchedAt || keywords.fetchedAt || new Date().toISOString(),
    campaign: meta.data,
    performance: thisCampaign ? {
      cost: microsToDollars(thisCampaign.costMicros || 0),
      clicks: thisCampaign.clicks,
      impressions: thisCampaign.impressions,
      conversions: thisCampaign.conversions,
      conversionsValue: thisCampaign.conversionsValue,
      roas: thisCampaign.costMicros > 0 ? +(thisCampaign.conversionsValue / microsToDollars(thisCampaign.costMicros)).toFixed(3) : 0,
    } : null,
    keywords: {
      total: (keywords.data || []).length,
      live: liveKws.length,
      dead: deadKws.length,
      deadInPausedAdGroups: deadInPausedAgs.length,
      liveKeywords: liveKws.slice(0, 30),
      deadKeywords: deadKws,
    },
    brandGeneric: brandGeneric.data,
    isTofAcquisition: brandGeneric.data?.isTofAcquisition || false,
    // Other campaigns for reallocation comparison
    allCampaigns: (campaignPerf.data || []).map(c => ({
      campaignId: c.campaignId,
      name: c.name,
      cost: microsToDollars(c.costMicros || 0),
      conversionsValue: c.conversionsValue,
      roas: c.costMicros > 0 ? +(c.conversionsValue / microsToDollars(c.costMicros)).toFixed(3) : 0,
    })),
  }
}

// ── Expose for the API route ───────────────────────────────────────────────

export function getCacheStats() {
  const entries = []
  for (const [key, entry] of _cache.entries()) {
    entries.push({
      key,
      fetchedAt: entry.fetchedAt,
      ageMs: Date.now() - entry.ts,
      expired: (Date.now() - entry.ts) > CACHE_TTL_MS,
    })
  }
  return {
    size: _cache.size,
    ttlMs: CACHE_TTL_MS,
    entries,
  }
}
