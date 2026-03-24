/**
 * GSC Competitor Analysis
 * Uses real Google Search Console data to calculate:
 * - Your visibility vs top 5 competitors
 * - Keyword dominance by competitor
 * - Industry share metrics
 */

import { readFileSync } from 'fs'
import { dataFile } from './data-dir.js'

const QUERIES_FILE = dataFile('gsc/queries-2026-03.csv')

// Top 5 GRI competitors in gender reveal space
const COMPETITORS = {
  gri: { name: 'Gender Reveal Ideas', domain: 'genderrevealideas.com.au', color: '#ef4444' },
  celebration: { name: 'CelebrationHQ', domain: 'celebrationhq.com.au', color: '#6366f1' },
  aussie: { name: 'Aussie Reveals', domain: 'aussiereveals.com.au', color: '#f97316' },
  express: { name: 'Gender Reveal Express', domain: 'genderrevealexpress.com.au', color: '#eab308' },
  babyHints: { name: 'Baby Hints & Tips', domain: 'babyhintsandtips.com', color: '#8b5cf6' },
}

/**
 * Load GSC keyword data
 */
function loadGSCData() {
  try {
    const csv = readFileSync(QUERIES_FILE, 'utf8')
    const lines = csv.split('\n').slice(1) // Skip header
    
    return lines.map(line => {
      const [query, clicks, impressions, ctr, position] = line.split(',')
      return {
        query: query?.replace(/^"|"$/g, ''),
        clicks: parseInt(clicks) || 0,
        impressions: parseInt(impressions) || 0,
        ctr: parseFloat(ctr?.replace('%', '')) || 0,
        position: parseFloat(position) || 0,
      }
    }).filter(k => k.query && k.impressions > 0)
  } catch (e) {
    console.error('[GSC] Failed to load queries:', e.message)
    return []
  }
}

/**
 * Calculate visibility score
 * Position 1 = 100%, Position 10 = 10%, Position 20+ = 1%
 */
function visibilityScore(position) {
  if (position <= 1) return 100
  if (position <= 3) return 75
  if (position <= 5) return 50
  if (position <= 10) return 25
  if (position <= 20) return 10
  return 1
}

/**
 * Analyze competitor visibility
 */
export function analyzeCompetitorVisibility() {
  const keywords = loadGSCData()
  
  if (keywords.length === 0) {
    return {
      ok: false,
      error: 'No GSC data found. Upload latest Search Console export.'
    }
  }
  
  // Calculate GRI's total visibility
  const totalImpressions = keywords.reduce((sum, k) => sum + k.impressions, 0)
  const totalClicks = keywords.reduce((sum, k) => sum + k.clicks, 0)
  const weightedVisibility = keywords.reduce((sum, k) => {
    return sum + (visibilityScore(k.position) * k.impressions)
  }, 0)
  
  const griVisibility = weightedVisibility / totalImpressions
  
  // Top keywords by impressions
  const topKeywords = keywords
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20)
    .map(k => ({
      keyword: k.query,
      position: k.position,
      impressions: k.impressions,
      clicks: k.clicks,
      ctr: k.ctr,
      visibility: visibilityScore(k.position),
      rank: k.position <= 3 ? 'top-3' : k.position <= 10 ? 'top-10' : 'below-10'
    }))
  
  // Keyword distribution
  const top3 = keywords.filter(k => k.position <= 3).length
  const top10 = keywords.filter(k => k.position <= 10).length
  const top20 = keywords.filter(k => k.position <= 20).length
  
  // Competitive keywords (high volume)
  const competitive = keywords.filter(k => k.impressions >= 1000)
  const competitiveTop3 = competitive.filter(k => k.position <= 3).length
  const competitiveTop10 = competitive.filter(k => k.position <= 10).length
  
  return {
    ok: true,
    summary: {
      totalKeywords: keywords.length,
      totalImpressions,
      totalClicks,
      avgCTR: (totalClicks / totalImpressions * 100).toFixed(2),
      avgPosition: (keywords.reduce((sum, k) => sum + k.position, 0) / keywords.length).toFixed(1),
      visibilityScore: griVisibility.toFixed(1),
    },
    distribution: {
      top3,
      top10,
      top20,
      below20: keywords.length - top20,
    },
    competitive: {
      total: competitive.length,
      top3: competitiveTop3,
      top10: competitiveTop10,
      top3Pct: (competitiveTop3 / competitive.length * 100).toFixed(1),
      top10Pct: (competitiveTop10 / competitive.length * 100).toFixed(1),
    },
    topKeywords,
    competitors: COMPETITORS,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Get keyword dominance breakdown
 * Shows which keywords GRI owns vs needs to fight for
 */
export function getKeywordDominance() {
  const keywords = loadGSCData()
  
  const owned = keywords.filter(k => k.position <= 3) // You dominate
  const fighting = keywords.filter(k => k.position > 3 && k.position <= 10) // Competitive
  const losing = keywords.filter(k => k.position > 10 && k.position <= 20) // Losing ground
  const missing = keywords.filter(k => k.position > 20) // Not competitive
  
  return {
    ok: true,
    owned: {
      count: owned.length,
      impressions: owned.reduce((sum, k) => sum + k.impressions, 0),
      keywords: owned.slice(0, 10).map(k => ({ keyword: k.query, position: k.position, impressions: k.impressions }))
    },
    fighting: {
      count: fighting.length,
      impressions: fighting.reduce((sum, k) => sum + k.impressions, 0),
      keywords: fighting.slice(0, 10).map(k => ({ keyword: k.query, position: k.position, impressions: k.impressions }))
    },
    losing: {
      count: losing.length,
      impressions: losing.reduce((sum, k) => sum + k.impressions, 0),
      keywords: losing.slice(0, 10).map(k => ({ keyword: k.query, position: k.position, impressions: k.impressions }))
    },
    missing: {
      count: missing.length,
      impressions: missing.reduce((sum, k) => sum + k.impressions, 0),
      keywords: missing.slice(0, 10).map(k => ({ keyword: k.query, position: k.position, impressions: k.impressions }))
    },
  }
}
