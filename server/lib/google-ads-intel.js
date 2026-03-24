/**
 * Google Ads Intelligence via DataForSEO
 * Pulls competitor paid search data: keywords bid on, ad copy, estimated CPC/spend, visibility
 */

import { env } from './env.js'
import { getCompetitors, getRivals } from './competitor-config.js'
import { appendScan, getLatestScan } from './competitor-history.js'

const API_BASE = 'https://api.dataforseo.com/v3'
const AUTH = env.dataForSEO?.auth || ''

async function dfsFetch(endpoint, payload) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok || data.status_code !== 20000) {
    throw new Error(data.status_message || `DataForSEO error: ${res.status}`)
  }
  return data
}

/**
 * Get paid search keywords for a domain
 * Returns keywords the domain is bidding on, ad positions, estimated traffic
 */
async function getDomainPaidKeywords(domain) {
  try {
    const data = await dfsFetch('/dataforseo_labs/google/domain_intersection/live', [{
      target1: domain,
      target2: domain,
      intersection_mode: 'union',
      item_types: ['paid'],
      location_code: 2036, // Australia
      language_code: 'en',
      limit: 50,
      order_by: ['metrics.paid.etv,desc'],
    }])

    const items = data.tasks?.[0]?.result?.[0]?.items || []
    return items.map(item => ({
      keyword: item.keyword,
      position: item.metrics?.paid?.pos || null,
      cpc: item.metrics?.paid?.cpc || 0,
      estimatedTraffic: item.metrics?.paid?.etv || 0,
      searchVolume: item.search_volume || 0,
      competition: item.competition || 0,
    }))
  } catch (e) {
    console.error(`[GoogleAdsIntel] Failed to get paid keywords for ${domain}:`, e.message)
    // Fallback: try ranked_keywords endpoint
    return await getDomainPaidKeywordsFallback(domain)
  }
}

/**
 * Fallback: get paid keywords via ranked_keywords
 */
async function getDomainPaidKeywordsFallback(domain) {
  try {
    const data = await dfsFetch('/dataforseo_labs/google/ranked_keywords/live', [{
      target: domain,
      location_code: 2036,
      language_code: 'en',
      item_types: ['paid'],
      limit: 50,
      order_by: ['keyword_data.keyword_info.search_volume,desc'],
    }])

    const items = data.tasks?.[0]?.result?.[0]?.items || []
    return items.map(item => ({
      keyword: item.keyword_data?.keyword || '',
      position: item.ranked_serp_element?.serp_item?.rank_absolute || null,
      cpc: item.keyword_data?.keyword_info?.cpc || 0,
      estimatedTraffic: item.ranked_serp_element?.serp_item?.etv || 0,
      searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
      competition: item.keyword_data?.keyword_info?.competition || 0,
    }))
  } catch (e) {
    console.error(`[GoogleAdsIntel] Fallback also failed for ${domain}:`, e.message)
    return []
  }
}

/**
 * Get Google Ads copy for specific keywords
 * Returns actual ad text (headlines, descriptions) from paid results
 */
async function getAdCopyForKeywords(keywords) {
  const adData = []

  for (const keyword of keywords) {
    try {
      const data = await dfsFetch('/serp/google/paid/live/advanced', [{
        keyword,
        location_code: 2036,
        language_code: 'en',
        device: 'desktop',
      }])

      const items = data.tasks?.[0]?.result?.[0]?.items || []
      for (const item of items) {
        adData.push({
          keyword,
          domain: item.domain || '',
          url: item.url || '',
          title: item.title || '',
          description: item.description || '',
          position: item.rank_absolute || null,
          breadcrumb: item.breadcrumb || '',
        })
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) {
      console.error(`[GoogleAdsIntel] Ad copy failed for "${keyword}":`, e.message)
    }
  }

  return adData
}

/**
 * Get domain-level paid search metrics
 */
async function getDomainPaidMetrics(domain) {
  try {
    const data = await dfsFetch('/dataforseo_labs/google/domain_metrics/live', [{
      target: domain,
      location_code: 2036,
      language_code: 'en',
    }])

    const metrics = data.tasks?.[0]?.result?.[0]?.metrics || {}
    const paid = metrics.paid || {}

    return {
      paidKeywords: paid.count || 0,
      estimatedTraffic: paid.etv || 0,
      estimatedCost: paid.estimated_paid_traffic_cost || 0,
      topPositions: paid.pos_1 || 0,
      positions2to3: paid.pos_2_3 || 0,
      positions4to10: paid.pos_4_10 || 0,
    }
  } catch (e) {
    console.error(`[GoogleAdsIntel] Domain metrics failed for ${domain}:`, e.message)
    return {
      paidKeywords: 0,
      estimatedTraffic: 0,
      estimatedCost: 0,
      topPositions: 0,
      positions2to3: 0,
      positions4to10: 0,
    }
  }
}

/**
 * Run a full Google Ads intelligence scan
 * Scans all competitors + GRI for paid search data
 */
export async function runGoogleAdsScan(targetKeywords = []) {
  console.log('[GoogleAdsIntel] Starting full Google Ads scan...')

  const competitors = getCompetitors()
  const results = {}

  // Step 1: Get domain-level paid metrics for everyone
  for (const [id, comp] of Object.entries(competitors)) {
    console.log(`[GoogleAdsIntel] Scanning paid metrics: ${comp.name}`)
    const metrics = await getDomainPaidMetrics(comp.domain)
    const keywords = await getDomainPaidKeywords(comp.domain)

    results[id] = {
      name: comp.name,
      domain: comp.domain,
      color: comp.color,
      metrics,
      paidKeywords: keywords,
    }

    await new Promise(r => setTimeout(r, 1000))
  }

  // Step 2: Get ad copy for top keywords (use provided keywords or top 15 by volume)
  const scanKeywords = targetKeywords.length > 0
    ? targetKeywords.slice(0, 15)
    : getTopPaidKeywords(results)

  console.log(`[GoogleAdsIntel] Fetching ad copy for ${scanKeywords.length} keywords...`)
  const adCopy = await getAdCopyForKeywords(scanKeywords)

  // Group ad copy by competitor domain
  for (const [id, comp] of Object.entries(competitors)) {
    results[id].adCopy = adCopy.filter(ad =>
      ad.domain.toLowerCase().includes(comp.domain.toLowerCase())
    )
  }

  // Step 3: Calculate visibility share
  const totalTraffic = Object.values(results).reduce((sum, r) => sum + r.metrics.estimatedTraffic, 0)
  for (const id of Object.keys(results)) {
    results[id].visibilityShare = totalTraffic > 0
      ? Math.round((results[id].metrics.estimatedTraffic / totalTraffic) * 100)
      : 0
  }

  const scanData = {
    competitors: results,
    keywords: scanKeywords,
    adCopy,
    totalEstimatedMarketSpend: Object.values(results).reduce((sum, r) => sum + r.metrics.estimatedCost, 0),
  }

  // Save to history
  appendScan('paid', scanData)

  console.log('[GoogleAdsIntel] Scan complete')
  return scanData
}

/**
 * Extract top paid keywords across all competitors
 */
function getTopPaidKeywords(results) {
  const allKeywords = new Map()

  for (const comp of Object.values(results)) {
    for (const kw of (comp.paidKeywords || [])) {
      if (!allKeywords.has(kw.keyword) || kw.searchVolume > allKeywords.get(kw.keyword).searchVolume) {
        allKeywords.set(kw.keyword, kw)
      }
    }
  }

  return [...allKeywords.entries()]
    .sort((a, b) => b[1].searchVolume - a[1].searchVolume)
    .slice(0, 15)
    .map(([kw]) => kw)
}

/**
 * Get cached latest Google Ads data
 */
export function getLatestGoogleAdsData() {
  return getLatestScan('paid')
}
