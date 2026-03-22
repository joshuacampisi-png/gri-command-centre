/**
 * DataForSEO API Client
 * Docs: https://docs.dataforseo.com/v3/
 * 
 * Features:
 * - Get real SERP rankings for any keyword + location
 * - Track competitors across Google AU
 * - Historical ranking data
 * - Organic search volume and metrics
 */

import { env } from './env.js'

const API_BASE = 'https://api.dataforseo.com/v3'
const AUTH = env.dataForSEO?.auth || 'Y29udGFjdEBjb3JleXdpbHRvbi5vcmc6ZmM0YzkwYzQ1NmZkM2JhZg=='

/**
 * Get current SERP rankings for a keyword
 * Returns top 100 organic results from Google AU
 */
export async function getSERPRankings(keyword, location = 'Australia') {
  const payload = [{
    keyword,
    location_name: location,
    language_code: 'en',
    device: 'desktop',
    os: 'windows',
    depth: 100, // Get top 100 results
  }]

  try {
    const res = await fetch(`${API_BASE}/serp/google/organic/live/advanced`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    
    if (!res.ok || data.status_code !== 20000) {
      throw new Error(data.status_message || `API error: ${res.status}`)
    }

    const results = data.tasks?.[0]?.result?.[0]?.items || []
    
    return {
      ok: true,
      keyword,
      location,
      totalResults: results.length,
      results: results.map(item => ({
        position: item.rank_absolute,
        url: item.url,
        domain: item.domain,
        title: item.title,
        description: item.description,
      })),
    }
  } catch (e) {
    console.error('[DataForSEO] SERP error:', e.message)
    return { ok: false, error: e.message }
  }
}

/**
 * Get competitor rankings for multiple keywords
 * Checks where each competitor ranks for each keyword
 */
export async function getCompetitorRankings(keywords, competitors) {
  const results = []
  
  for (const keyword of keywords) {
    console.log(`[DataForSEO] Checking: "${keyword}"`)
    const serp = await getSERPRankings(keyword, 'Australia')
    
    if (!serp.ok) {
      console.error(`[DataForSEO] Failed: ${keyword} — ${serp.error}`)
      continue
    }

    const positions = {}
    
    for (const comp of competitors) {
      const match = serp.results.find(r => 
        (r.domain && r.domain.toLowerCase().includes(comp.domain.toLowerCase())) ||
        (r.url && r.url.toLowerCase().includes(comp.domain.toLowerCase()))
      )
      
      positions[comp.id] = match ? {
        rank: match.position,
        url: match.url,
        title: match.title,
      } : null
    }

    results.push({
      keyword,
      positions,
      scrapedAt: new Date().toISOString(),
    })

    // Rate limit: 1 request per second (DataForSEO free tier)
    await new Promise(r => setTimeout(r, 1000))
  }

  return { ok: true, keywords: results }
}

/**
 * Get domain overview metrics
 * Returns organic traffic, keywords ranking, visibility
 */
export async function getDomainOverview(domain, location = 'Australia') {
  const payload = [{
    target: domain,
    location_name: location,
    language_code: 'en',
  }]

  try {
    const res = await fetch(`${API_BASE}/dataforseo_labs/google/domain_metrics/live`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    
    if (!res.ok || data.status_code !== 20000) {
      throw new Error(data.status_message || `API error: ${res.status}`)
    }

    const metrics = data.tasks?.[0]?.result?.[0]?.metrics || {}
    
    return {
      ok: true,
      domain,
      organic_etv: metrics.organic?.etv || 0, // Estimated traffic value
      organic_count: metrics.organic?.count || 0, // Keywords ranking
      organic_pos_1: metrics.organic?.pos_1 || 0, // #1 positions
      organic_pos_2_3: metrics.organic?.pos_2_3 || 0, // #2-3 positions
      organic_pos_4_10: metrics.organic?.pos_4_10 || 0, // #4-10 positions
    }
  } catch (e) {
    console.error('[DataForSEO] Domain overview error:', e.message)
    return { ok: false, error: e.message }
  }
}

/**
 * Test connection
 */
export async function testConnection() {
  try {
    const res = await fetch(`${API_BASE}/appendix/user_data`, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${AUTH}` },
    })

    const data = await res.json()
    
    return {
      ok: res.ok && data.status_code === 20000,
      status: data.status_message,
      rateLimit: data.tasks?.[0]?.result?.money || null,
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
