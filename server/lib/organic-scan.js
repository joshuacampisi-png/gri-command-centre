/**
 * Organic Rankings Scanner (DataForSEO)
 * Replaces the broken Playwright scraper with DataForSEO SERP API.
 * Tracks all competitor organic positions for tracked keywords.
 */

import { env } from './env.js'
import { getCompetitors } from './competitor-config.js'
import { appendScan, getLatestScan } from './competitor-history.js'

const API_BASE = 'https://api.dataforseo.com/v3'
const AUTH = env.dataForSEO?.auth || ''

/**
 * Get organic SERP results for a keyword from DataForSEO
 */
async function getSERPForKeyword(keyword) {
  const res = await fetch(`${API_BASE}/serp/google/organic/live/advanced`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{
      keyword,
      location_code: 2036, // Australia
      language_code: 'en',
      device: 'desktop',
      depth: 50,
    }]),
  })

  const data = await res.json()
  if (!res.ok || data.status_code !== 20000) {
    throw new Error(data.status_message || `API error: ${res.status}`)
  }

  return data.tasks?.[0]?.result?.[0]?.items || []
}

/**
 * Run organic rankings scan for all competitors
 * @param {string[]} keywords — keywords to scan
 */
export async function runOrganicScan(keywords) {
  console.log(`[OrganicScan] Starting scan for ${keywords.length} keywords...`)

  const competitors = getCompetitors()
  const keywordResults = []

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i]
    console.log(`[OrganicScan] [${i + 1}/${keywords.length}] "${keyword}"`)

    try {
      const serpItems = await getSERPForKeyword(keyword)

      const positions = {}
      for (const [id, comp] of Object.entries(competitors)) {
        const match = serpItems.find(item =>
          item.domain && item.domain.toLowerCase().includes(comp.domain.toLowerCase())
        )
        positions[id] = match ? {
          rank: match.rank_absolute,
          url: match.url,
          title: match.title,
          description: match.description,
        } : { rank: null, url: null, title: null, description: null }
      }

      keywordResults.push({
        keyword,
        positions,
        scrapedAt: new Date().toISOString(),
      })
    } catch (e) {
      console.error(`[OrganicScan] Failed: "${keyword}" — ${e.message}`)
      keywordResults.push({
        keyword,
        positions: Object.fromEntries(
          Object.keys(competitors).map(k => [k, { rank: null, url: null, title: null, description: null }])
        ),
        error: e.message,
        scrapedAt: new Date().toISOString(),
      })
    }

    // Rate limit: 1 req/sec
    if (i < keywords.length - 1) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  // Compute summary per competitor
  const summary = {}
  for (const [id] of Object.entries(competitors)) {
    const ranked = keywordResults.filter(r => r.positions[id]?.rank !== null)
    const top3 = ranked.filter(r => r.positions[id].rank <= 3).length
    const top10 = ranked.filter(r => r.positions[id].rank <= 10).length
    const avg = ranked.length > 0
      ? Math.round(ranked.reduce((s, r) => s + r.positions[id].rank, 0) / ranked.length)
      : null
    summary[id] = { ranked: ranked.length, top3, top10, avgRank: avg }
  }

  const scanData = {
    competitors: Object.fromEntries(
      Object.entries(competitors).map(([id, comp]) => [id, {
        name: comp.name,
        domain: comp.domain,
        color: comp.color,
        summary: summary[id],
      }])
    ),
    keywords: keywordResults,
    summary,
  }

  // Save to history
  appendScan('organic', scanData)

  console.log(`[OrganicScan] Complete: ${keywordResults.length} keywords, ${keywordResults.filter(r => !r.error).length} successful`)
  return scanData
}

/**
 * Get the latest organic scan data
 */
export function getLatestOrganicData() {
  return getLatestScan('organic')
}

/**
 * Get top keywords by search volume from DataForSEO
 * Used to determine which keywords to scan for paid search
 */
export async function getTopKeywordsByVolume(keywords, limit = 15) {
  try {
    const res = await fetch(`${API_BASE}/dataforseo_labs/google/keyword_info/live`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        keywords,
        location_code: 2036,
        language_code: 'en',
      }]),
    })

    const data = await res.json()
    const items = data.tasks?.[0]?.result || []

    return items
      .filter(i => i.search_volume > 0)
      .sort((a, b) => b.search_volume - a.search_volume)
      .slice(0, limit)
      .map(i => ({
        keyword: i.keyword,
        volume: i.search_volume,
        cpc: i.cpc || 0,
        competition: i.competition || 0,
      }))
  } catch (e) {
    console.error('[OrganicScan] Keyword volume lookup failed:', e.message)
    return keywords.slice(0, limit).map(k => ({ keyword: k, volume: 0, cpc: 0, competition: 0 }))
  }
}
